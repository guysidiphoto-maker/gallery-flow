import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { nativeImage } from 'electron'

export async function exportGallery(
  projectName: string,
  clientName: string,
  imagePaths: string[],
  destDir: string,
  topPickPaths: string[],
  settings?: { studioName?: string; logoPath?: string | null; allowDownloads?: boolean; autoGenerateStories?: boolean }
): Promise<{ success: boolean; error?: string; galleryDir?: string }> {
  try {
    const galleryDir = join(destDir, projectName.replace(/[/\\?%*:|"<>]/g, '-'))
    const imagesDir = join(galleryDir, 'images')
    mkdirSync(imagesDir, { recursive: true })

    // Create stories directory
    const storiesDir = join(galleryDir, 'stories')
    mkdirSync(storiesDir, { recursive: true })

    // Copy images and create thumbnails
    const imageData: Array<{ filename: string; thumb: string; full: string }> = []

    for (let i = 0; i < imagePaths.length; i++) {
      const src = imagePaths[i]
      if (!existsSync(src)) continue
      const ext = src.split('.').pop()?.toLowerCase() || 'jpg'
      const name = `img_${String(i + 1).padStart(3, '0')}`
      const fullName = `${name}.${ext}`
      const thumbName = `${name}_thumb.jpg`

      // Copy full image
      copyFileSync(src, join(imagesDir, fullName))

      // Create thumbnail (resize to 800px wide)
      try {
        const img = nativeImage.createFromPath(src)
        const size = img.getSize()
        if (size.width > 800) {
          const resized = img.resize({ width: 800, quality: 'good' })
          writeFileSync(join(imagesDir, thumbName), resized.toJPEG(80))
        } else {
          copyFileSync(src, join(imagesDir, thumbName))
        }
      } catch {
        copyFileSync(src, join(imagesDir, thumbName))
      }

      imageData.push({ filename: basename(src), thumb: `images/${thumbName}`, full: `images/${fullName}` })
    }

    // Determine story names for HTML (stories will be rendered by the renderer process)
    const storyStyles = topPickPaths.length >= 2
      ? ['minimal', 'bold', 'cinematic', 'fast']
      : []

    // Generate HTML
    const html = generateGalleryHTML(projectName, clientName, imageData, storyStyles, settings)
    writeFileSync(join(galleryDir, 'index.html'), html)

    return { success: true, galleryDir }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

function generateGalleryHTML(
  projectName: string,
  clientName: string,
  images: Array<{ filename: string; thumb: string; full: string }>,
  storyStyles: string[],
  settings?: { studioName?: string; logoPath?: string | null; allowDownloads?: boolean; autoGenerateStories?: boolean }
): string {
  const escapedProjectName = projectName.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const escapedClientName = clientName ? clientName.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapedProjectName}${escapedClientName ? ` \u2014 ${escapedClientName}` : ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh}
.header{padding:40px 24px 24px;text-align:center}
.header h1{font-size:28px;font-weight:800;color:rgba(255,255,255,.9);letter-spacing:-.01em}
.header p{font-size:14px;color:rgba(255,255,255,.35);margin-top:6px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:3px;padding:0 3px}
@media(min-width:600px){.grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:900px){.grid{grid-template-columns:repeat(4,1fr);gap:4px;padding:0 4px}}
@media(min-width:1200px){.grid{grid-template-columns:repeat(5,1fr)}}
.grid img{width:100%;aspect-ratio:1;object-fit:cover;cursor:pointer;transition:opacity .15s}
.grid img:hover{opacity:.85}
.viewer{position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:1000;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
.viewer.active{opacity:1;pointer-events:all}
.viewer img{max-width:95vw;max-height:90vh;object-fit:contain}
.viewer .close{position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.viewer .close:hover{background:rgba(255,255,255,.2)}
.viewer .nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.08);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.viewer .nav:hover{background:rgba(255,255,255,.15)}
.viewer .prev{left:12px}
.viewer .next{right:12px}
.viewer .counter{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-size:13px;color:rgba(255,255,255,.4)}
.viewer .download{position:absolute;bottom:16px;right:16px;padding:8px 16px;background:rgba(99,102,241,.8);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none}
.viewer .download:hover{background:rgba(99,102,241,1)}
.footer{text-align:center;padding:40px 24px;color:rgba(255,255,255,.15);font-size:11px}
.stories{padding:0 16px 24px;text-align:center}
.stories h2{font-size:16px;font-weight:700;color:rgba(255,255,255,.85);margin:0 0 4px}
.stories .sub{font-size:12px;color:rgba(255,255,255,.3);margin:0 0 16px}
.stories .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.stories .card{display:flex;flex-direction:column;align-items:center;gap:8px;width:120px}
.stories .preview{width:120px;height:213px;border-radius:12px;background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(168,85,247,.1));border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.25)}
.stories .sname{font-size:12px;font-weight:600;color:rgba(255,255,255,.6)}
.stories .dl{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;background:rgba(99,102,241,.12);color:#a5b4fc;font-size:11px;font-weight:600;text-decoration:none;transition:background .12s}
.stories .dl:hover{background:rgba(99,102,241,.2)}
</style>
</head>
<body>
<div class="header">
<h1>${escapedProjectName}</h1>
${escapedClientName ? `<p>${escapedClientName} \u00B7 ${images.length} photos</p>` : `<p>${images.length} photos</p>`}
</div>
${storyStyles.length > 0 ? `<div class="stories">
<h2>Your Stories</h2>
<p class="sub">Ready to share on Instagram</p>
<div class="row">
${storyStyles.map(s => `<div class="card"><div class="preview"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><span class="sname">${s.charAt(0).toUpperCase() + s.slice(1)}</span><a class="dl" href="stories/story_${s}.mp4" download>Download</a></div>`).join('\n')}
</div>
</div>` : ''}
<div class="grid">
${images.map((img, i) => `<img src="${img.thumb}" data-full="${img.full}" data-index="${i}" loading="lazy" alt="">`).join('\n')}
</div>
<div class="viewer" id="viewer">
<button class="close" onclick="closeViewer()">\u2715</button>
<button class="nav prev" onclick="navigate(-1)">\u2039</button>
<button class="nav next" onclick="navigate(1)">\u203A</button>
<img id="viewerImg" src="" alt="">
<div class="counter" id="counter"></div>
${settings?.allowDownloads !== false ? '<a class="download" id="downloadBtn" href="" download>Download</a>' : ''}
</div>
<div class="footer">${settings?.studioName ? settings.studioName.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Delivered with Pixflow'}</div>
<script>
const images=${JSON.stringify(images)};
let current=-1;
const viewer=document.getElementById('viewer');
const viewerImg=document.getElementById('viewerImg');
const counter=document.getElementById('counter');
const downloadBtn=document.getElementById('downloadBtn');
document.querySelector('.grid').addEventListener('click',function(e){
  var img=e.target.closest('img');
  if(!img)return;
  openViewer(parseInt(img.dataset.index));
});
function openViewer(i){current=i;update();viewer.classList.add('active')}
function closeViewer(){viewer.classList.remove('active');current=-1}
function navigate(d){if(current<0)return;current=(current+d+images.length)%images.length;update()}
function update(){
  viewerImg.src=images[current].full;
  counter.textContent=(current+1)+' / '+images.length;
  downloadBtn.href=images[current].full;
  downloadBtn.download=images[current].filename;
}
document.addEventListener('keydown',function(e){
  if(current<0)return;
  if(e.key==='Escape')closeViewer();
  if(e.key==='ArrowRight')navigate(1);
  if(e.key==='ArrowLeft')navigate(-1);
});
var tx=0;
viewer.addEventListener('touchstart',function(e){tx=e.touches[0].clientX});
viewer.addEventListener('touchend',function(e){
  var dx=e.changedTouches[0].clientX-tx;
  if(Math.abs(dx)>50){navigate(dx<0?1:-1)}
});
</script>
</body>
</html>`
}
