import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = 'https://gitee.com/api/v5'

export function createGiteeReleaseClient({ token, fetchImpl = fetch, log = console.log }) {
  if (!token) throw new Error('missing-gitee-token')
  const authorization = { Authorization: `token ${token}` }

  async function requestJson(path, {
    method = 'GET',
    form,
    allowNotFound = false,
    expectNoContent = false,
    operation = 'request',
  } = {}) {
    const headers = { ...authorization }
    const init = { method, headers }
    if (form) {
      const body = new URLSearchParams()
      for (const [key, value] of Object.entries(form)) body.set(key, String(value))
      headers['content-type'] = 'application/x-www-form-urlencoded'
      init.body = body
    }
    const response = await fetchImpl(`${API_ROOT}${path}`, init)
    if (allowNotFound && response.status === 404) return null
    if (expectNoContent && response.status === 204) return null
    if (!response.ok) throw new Error(`Gitee ${operation} failed with status ${response.status}`)
    if (response.status === 204) return null
    return response.json()
  }

  async function upsertRelease({ owner, repo, tag, name, body }) {
    const existing = await requestJson(
      `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
      { allowNotFound: true, operation: 'release lookup' },
    )
    const project = await requestJson(`/repos/${owner}/${repo}`, {
      operation: 'repository lookup',
    })
    const form = {
      tag_name: tag,
      name,
      body,
      prerelease: 'false',
      ...(!existing && { target_commitish: project.default_branch || 'main' }),
    }
    return requestJson(
      existing
        ? `/repos/${owner}/${repo}/releases/${existing.id}`
        : `/repos/${owner}/${repo}/releases`,
      { method: existing ? 'PATCH' : 'POST', form, operation: 'release upsert' },
    )
  }

  async function replaceAsset({ owner, repo, releaseId, file }) {
    const filename = basename(file)
    const assets = await requestJson(
      `/repos/${owner}/${repo}/releases/${releaseId}/attach_files`,
      { operation: 'asset listing' },
    )
    for (const asset of assets ?? []) {
      if (asset.name !== filename) continue
      await requestJson(
        `/repos/${owner}/${repo}/releases/${releaseId}/attach_files/${asset.id}`,
        { method: 'DELETE', expectNoContent: true, operation: 'asset replacement' },
      )
    }

    const data = await readFile(file)
    const form = new FormData()
    form.append('file', new Blob([data]), filename)
    const response = await fetchImpl(
      `${API_ROOT}/repos/${owner}/${repo}/releases/${releaseId}/attach_files`,
      { method: 'POST', headers: authorization, body: form },
    )
    if (!response.ok) throw new Error(`Gitee asset upload failed with status ${response.status}`)
    log(`Uploaded ${filename}`)
  }

  async function publishRelease({ repo: repository, tag, name, body = '', files = [] }) {
    const [owner, repo] = repository.split('/')
    if (!owner || !repo) throw new Error('invalid-gitee-repository')
    const release = await upsertRelease({ owner, repo, tag, name, body })
    for (const file of files) await replaceAsset({ owner, repo, releaseId: release.id, file })
    log(`Published ${owner}/${repo}#${release.tag_name}`)
    return release
  }

  return { publishRelease, replaceAsset, upsertRelease }
}

function parseArgs(argv) {
  const parsed = { files: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) continue
    const key = argument.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) parsed[key] = 'true'
    else {
      if (key === 'file') parsed.files.push(value)
      else parsed[key] = value
      index += 1
    }
  }
  return parsed
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const required = (name) => {
    if (!options[name]) throw new Error(`missing-${name}`)
    return options[name]
  }
  const client = createGiteeReleaseClient({ token: process.env.GITEE_TOKEN })
  await client.publishRelease({
    repo: required('repo'),
    tag: required('tag'),
    name: required('name'),
    body: options.body ?? '',
    files: options.files,
  })
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Gitee publication failed')
    process.exitCode = 1
  })
}
