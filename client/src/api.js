async function asJson(res) {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message)
  }
  return res.json()
}

export const getProject = () => fetch('/api/project').then(asJson)

export const putProject = (project) =>
  fetch('/api/project', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project })
  }).then(asJson)

export const uploadImages = (files, meta) => {
  const fd = new FormData()
  fd.append('meta', JSON.stringify(meta))
  for (const f of files) fd.append('images', f)
  return fetch('/api/upload', { method: 'POST', body: fd }).then(asJson)
}

export const deletePage = (id) =>
  fetch(`/api/pages/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(asJson)

export const generate = () => fetch('/api/generate', { method: 'POST' }).then(asJson)

/** Read natural dimensions of an image File in the browser (cosmetic metadata). */
export function readImageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => {
      resolve({ width: im.naturalWidth, height: im.naturalHeight })
      URL.revokeObjectURL(url)
    }
    im.onerror = () => {
      resolve({ width: null, height: null })
      URL.revokeObjectURL(url)
    }
    im.src = url
  })
}
