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

export function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/data:(.*?);/)[1]
  const bytes = atob(body)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
