import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const API_ROOT = 'https://gitee.com/api/v5'

const options = parseArgs()
const token = process.env.GITEE_TOKEN
if (!token) {
  console.error('Missing GITEE_TOKEN')
  process.exit(1)
}

const [owner, repo] = (options.repo ?? '').split('/')
if (!owner || !repo) {
  console.error('Usage: GITEE_TOKEN=... node tools/publish-gitee-release.mjs --repo <owner>/<repo> --tag <tag> --name <name> --body <body> --file <path> [--file <path>]')
  process.exit(1)
}

const release = await upsertRelease({
  owner,
  repo,
  tag: requireOption('tag'),
  name: requireOption('name'),
  body: options.body ?? '',
})

for (const file of options.files) {
  await replaceAsset({ owner, repo, releaseId: release.id, file })
}

console.log(`Published ${owner}/${repo}#${release.tag_name}`)

function parseArgs() {
  const parsed = { files: [] }
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const value = process.argv[index + 1]
    if (!value || value.startsWith('--')) {
      parsed[key] = 'true'
    } else {
      if (key === 'file') parsed.files.push(value)
      else parsed[key] = value
      index += 1
    }
  }
  return parsed
}

function requireOption(name) {
  const value = options[name]
  if (!value) {
    console.error(`Missing --${name}`)
    process.exit(1)
  }
  return value
}

async function upsertRelease({ owner, repo, tag, name, body }) {
  const existing = await requestJson(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    method: 'GET',
    allowNotFound: true,
  })
  const project = await requestJson(`/repos/${owner}/${repo}`, { method: 'GET' })
  const target = project.default_branch || 'main'

  if (existing) {
    return requestJson(`/repos/${owner}/${repo}/releases/${existing.id}`, {
      method: 'PATCH',
      form: {
        tag_name: tag,
        name,
        body,
        prerelease: 'false',
      },
    })
  }

  return requestJson(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    form: {
      tag_name: tag,
      name,
      body,
      prerelease: 'false',
      target_commitish: target,
    },
  })
}

async function replaceAsset({ owner, repo, releaseId, file }) {
  const filename = basename(file)
  const assets = await requestJson(`/repos/${owner}/${repo}/releases/${releaseId}/attach_files`, {
    method: 'GET',
  })
  for (const asset of assets ?? []) {
    if (asset.name !== filename) continue
    await requestJson(`/repos/${owner}/${repo}/releases/${releaseId}/attach_files/${asset.id}`, {
      method: 'DELETE',
      expectNoContent: true,
    })
  }

  const data = await readFile(file)
  const form = new FormData()
  form.append('access_token', token)
  form.append('file', new Blob([data]), filename)
  const response = await fetch(`${API_ROOT}/repos/${owner}/${repo}/releases/${releaseId}/attach_files`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) await throwApiError(response)
  console.log(`Uploaded ${filename}`)
}

async function requestJson(path, { method, form, allowNotFound = false, expectNoContent = false } = {}) {
  const init = { method }
  let url = `${API_ROOT}${path}`
  if (form) {
    const body = new URLSearchParams()
    body.set('access_token', token)
    for (const [key, value] of Object.entries(form)) body.set(key, value)
    init.body = body
    init.headers = { 'content-type': 'application/x-www-form-urlencoded' }
  } else {
    const separator = url.includes('?') ? '&' : '?'
    url = `${url}${separator}access_token=${encodeURIComponent(token)}`
  }

  const response = await fetch(url, init)
  if (allowNotFound && response.status === 404) return null
  if (expectNoContent && response.status === 204) return null
  if (!response.ok) await throwApiError(response)
  if (response.status === 204) return null
  return response.json()
}

async function throwApiError(response) {
  const text = await response.text()
  throw new Error(`Gitee API ${response.status}: ${text}`)
}
