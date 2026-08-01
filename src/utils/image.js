/**
 * Client-side image processing: center-crop to a target aspect and resize,
 * so uploads are tiny regardless of the original photo size.
 */
function resizeTo(file, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const targetRatio = width / height
        let cw = img.width
        let ch = img.height
        if (cw / ch > targetRatio) cw = ch * targetRatio
        else ch = cw / targetRatio
        const sx = (img.width - cw) / 2
        const sy = (img.height - ch) / 2
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        reject(new Error("Couldn't process that image — try another photo."))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that image — try another photo."))
    }
    img.src = url
  })
}

/** Square avatar, 256px. */
export function resizeImageFile(file, size = 256) {
  return resizeTo(file, size, size)
}

/** 16:9 event cover, 800×450. */
export function resizeCoverFile(file) {
  return resizeTo(file, 800, 450)
}

/**
 * Recap photo: keeps the original aspect ratio, capped at 1280px on the
 * longest side (stories are usually portrait — no forced crop).
 */
export function resizeMemoryFile(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        reject(new Error("Couldn't process that image — try another photo."))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that image — try another photo."))
    }
    img.src = url
  })
}

/**
 * Short recap clip: validates duration (max `maxSeconds`) and returns the
 * file as a data URL for the demo/live upload pipeline.
 */
export function readVideoFile(file, maxSeconds = 10) {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video')
    const url = URL.createObjectURL(file)
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      if (probe.duration > maxSeconds + 0.5) {
        reject(new Error(`Clips can be at most ${maxSeconds} seconds.`))
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error("Couldn't read that clip — try another."))
      reader.readAsDataURL(file)
    }
    probe.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that clip — try an .mp4 file."))
    }
    probe.src = url
  })
}

export function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/data:(.*?);/)[1]
  const bytes = atob(body)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
