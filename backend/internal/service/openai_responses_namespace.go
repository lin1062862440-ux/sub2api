package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/apicompat"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

const openAIResponsesNamespaceNamesContextKey = "openai_responses_namespace_names"

// shouldFlattenOpenAIResponsesNamespaces 判定原生 Responses 转发前是否摊平
// Codex namespace 工具。
//
// 默认不摊平：OAuth 账号的 HTTP 出口恒为 chatgpt.com/backend-api/codex/responses
// （buildUpstreamRequest 只在 API Key 分支读 base_url），也就是 namespace 扩展的
// 定义方本身；Codex 客户端对 WS 与 HTTP 两条传输发送同一份 tools（codex-rs
// client.rs build_responses_request 无传输分支，WS 失败后会 session 级回落 HTTP
// 继续发同样的声明）。摊平只改写工具名，改不掉客户端在 tools 描述与 developer
// 消息里写死的 `to=functions.<namespace>.<tool>` 寻址约定，模型据此寻址必然落空
// （issue #4978）；命名空间名还可由 features.multi_agent_v2.tool_namespace 自定义、
// 或由 MCP/connector 动态生成（mcp__codex_apps__gmail），保留名单枚举不完。
//
// compact 端点不再默认摊平：真实 Codex 历史里仍可能包含 namespaced
// function_call/custom_tool_call，提前移除 namespace 会触发
// `Missing namespace for function_call`。只在账号显式开启兼容开关时恢复旧的
// 摊平行为。
//
// 账号开关 openai_responses_flatten_namespaces 为不认识 namespace 的兼容上游保留
// 退路，打开后恢复旧行为：WSv2 上游原生支持 namespace，且 WS 出口
// （openai_ws_forwarder_v2）原样转发上游事件、不经 HTTP 回程还原，摊平后的平名
// 无法还原会破坏客户端工具匹配，因此实际走 WSv2 分支的请求仍保持 namespace 原样；
// 透传账号先于 WSv2 分支经 HTTP 转发返回，仍需摊平。
func shouldFlattenOpenAIResponsesNamespaces(
	account *Account,
	transport OpenAIUpstreamTransport,
	passthroughEnabled bool,
	compactPath bool,
) bool {
	if account == nil || !account.IsOpenAIOAuth() {
		return false
	}
	if !account.IsOpenAIResponsesFlattenNamespacesEnabled() {
		return false
	}
	if transport == OpenAIUpstreamTransportResponsesWebsocketV2 && !passthroughEnabled {
		return false
	}
	return true
}

// shouldStripOpenAIResponsesInputNamespaces removes residual input item
// namespaces for OpenAI OAuth and API Key HTTP forwarding. Native WSv2 keeps
// namespaces because that protocol supports them and does not restore payloads.
func shouldStripOpenAIResponsesInputNamespaces(account *Account, transport OpenAIUpstreamTransport, passthroughEnabled bool) bool {
	if account == nil || (!account.IsOpenAIOAuth() && !account.IsOpenAIApiKey()) {
		return false
	}
	if transport == OpenAIUpstreamTransportResponsesWebsocketV2 && !passthroughEnabled {
		return false
	}
	return true
}

// shouldKeepOpenAIResponsesToolCallNamespaces 判定清理 input 残留 namespace 时是否
// 保留工具调用项上的 namespace。
//
// 上游对这个字段有两套互斥要求，判定按「出口 + 端点」而非工具声明内容：
//   - /backend-api/codex/responses 会按 namespace 解析历史调用，缺字段直接 400
//     `Missing namespace for function_call '...'. Round-trip the model's
//     function_call item with its namespace field included.`（issue #4761 回帖），
//     故 OAuth 非 compact 请求必须保留。
//   - API Key 与 compatible Responses 出口也必须保留真实 Codex 调用项的
//     namespace，避免下一轮对话丢失工具命名空间；普通 message/reasoning 等残留
//     namespace 仍会被清理。
//   - 摊平模式下调用项已被改写成平名，残留 namespace 指向的声明已不存在，一律清理。
func shouldKeepOpenAIResponsesToolCallNamespaces(
	account *Account,
	transport OpenAIUpstreamTransport,
	passthroughEnabled bool,
	compactPath bool,
) bool {
	if account == nil || (!account.IsOpenAIOAuth() && !account.IsOpenAIApiKey()) {
		return false
	}
	return !shouldFlattenOpenAIResponsesNamespaces(account, transport, passthroughEnabled, compactPath)
}

// openAIResponsesToolCallItemTypes 是直接转发时允许保留 namespace 的调用项类型集合。
// 若上游明确拒绝某个 input[N].namespace，反应式 retry 只保护
// function_call/custom_tool_call；tool_call/mcp_tool_call 可按索引删除。
var openAIResponsesToolCallItemTypes = map[string]bool{
	"function_call":    true,
	"tool_call":        true,
	"custom_tool_call": true,
	"mcp_tool_call":    true,
}

func isOpenAIResponsesToolCallItemType(itemType string) bool {
	return openAIResponsesToolCallItemTypes[strings.ToLower(strings.TrimSpace(itemType))]
}

func openAIResponsesInputItemSupportsNamespace(item gjson.Result) bool {
	switch strings.ToLower(strings.TrimSpace(item.Get("type").String())) {
	case "function_call", "custom_tool_call":
		return true
	default:
		return false
	}
}

func flattenOpenAIResponsesNamespaces(c *gin.Context, body []byte) ([]byte, error) {
	if !bytes.Contains(body, []byte(`"namespace"`)) {
		return body, nil
	}
	var requestBody map[string]any
	if err := json.Unmarshal(body, &requestBody); err != nil {
		return body, fmt.Errorf("decode OpenAI namespace body: %w", err)
	}
	names, changed, err := apicompat.FlattenResponsesNamespacesExcept(requestBody, map[string]bool{"image_gen": true})
	if err != nil {
		return body, err
	}
	if !changed {
		return body, nil
	}
	rebuilt, err := marshalOpenAIUpstreamJSON(requestBody)
	if err != nil {
		return body, fmt.Errorf("encode OpenAI namespace body: %w", err)
	}
	setOpenAIResponsesNamespaceNames(c, names)
	return rebuilt, nil
}

// stripOpenAIResponsesInputNamespaces removes namespace only from direct input
// array items. Namespace declarations and nested namespace fields are left
// untouched. Rebuilding the input array once keeps this linear for long
// histories and avoids decoding JSON numbers through float64.
//
// keepToolCallNamespaces 保留工具调用项（function_call / custom_tool_call 等）上的
// namespace，让 Codex 调用能按上游要求原样回传；判定见
// shouldKeepOpenAIResponsesToolCallNamespaces。
func stripOpenAIResponsesInputNamespaces(body []byte, keepToolCallNamespacesArg ...bool) ([]byte, error) {
	if !bytes.Contains(body, []byte(`"namespace"`)) {
		return body, nil
	}
	input := gjson.GetBytes(body, "input")
	if !input.IsArray() {
		return body, nil
	}
	keepToolCallNamespaces := true
	if len(keepToolCallNamespacesArg) > 0 {
		keepToolCallNamespaces = keepToolCallNamespacesArg[0]
	}

	var rebuilt bytes.Buffer
	rebuilt.Grow(len(input.Raw))
	_ = rebuilt.WriteByte('[')
	changed := false
	first := true
	var stripErr error
	input.ForEach(func(_, item gjson.Result) bool {
		if !first {
			_ = rebuilt.WriteByte(',')
		}
		first = false
		itemBody := []byte(item.Raw)
		// 先判存在再判类型：长历史里绝大多数是 message/reasoning 等不带 namespace
		// 的项，这样它们无需再扫一次 type。
		if item.IsObject() && item.Get("namespace").Exists() &&
			(!keepToolCallNamespaces || !isOpenAIResponsesToolCallItemType(item.Get("type").String())) {
			itemBody, stripErr = sjson.DeleteBytes(itemBody, "namespace")
			if stripErr != nil {
				return false
			}
			changed = true
		}
		_, _ = rebuilt.Write(itemBody)
		return true
	})
	_ = rebuilt.WriteByte(']')
	if stripErr != nil {
		return body, fmt.Errorf("delete OpenAI input namespace: %w", stripErr)
	}
	if !changed {
		return body, nil
	}
	stripped, err := sjson.SetRawBytes(body, "input", rebuilt.Bytes())
	if err != nil {
		return body, fmt.Errorf("replace OpenAI input after namespace deletion: %w", err)
	}
	return stripped, nil
}

func setOpenAIResponsesNamespaceNames(c *gin.Context, names map[string]apicompat.ResponsesNamespaceName) {
	if c != nil && len(names) > 0 {
		c.Set(openAIResponsesNamespaceNamesContextKey, names)
	}
}

// clearOpenAIResponsesNamespaceNames 清除上一次尝试登记的摊平名映射。handler 的
// failover 会在同一个 *gin.Context 上重试下一个账号，映射不清会让保留 namespace 的
// 账号拿着上一个账号的摊平名做回程还原。
func clearOpenAIResponsesNamespaceNames(c *gin.Context) {
	if c == nil {
		return
	}
	if _, exists := c.Get(openAIResponsesNamespaceNamesContextKey); exists {
		c.Set(openAIResponsesNamespaceNamesContextKey, map[string]apicompat.ResponsesNamespaceName(nil))
	}
}

func openAIResponsesNamespaceNames(c *gin.Context) map[string]apicompat.ResponsesNamespaceName {
	if c == nil {
		return nil
	}
	value, ok := c.Get(openAIResponsesNamespaceNamesContextKey)
	if !ok {
		return nil
	}
	names, _ := value.(map[string]apicompat.ResponsesNamespaceName)
	return names
}

func restoreOpenAIResponsesNamespacePayload(c *gin.Context, payload []byte) ([]byte, error) {
	names := openAIResponsesNamespaceNames(c)
	if len(names) == 0 || !json.Valid(payload) {
		return payload, nil
	}
	restored, changed, err := apicompat.RestoreResponsesNamespaceCalls(payload, names)
	if err != nil {
		return payload, err
	}
	if changed {
		return restored, nil
	}
	return payload, nil
}
