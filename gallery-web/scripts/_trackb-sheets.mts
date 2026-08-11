import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import path from "node:path";
const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFMPEG = path.join(COMP, "ffmpeg"), FFPROBE = path.join(COMP, "ffprobe");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const OUT = "/tmp/trackb-out", SHEET = "/tmp/trackb-sheets";
mkdirSync(SHEET, { recursive: true });
for (const label of ["AUTO", "VARIANT-cinematic", "VARIANT-fast"]) {
  const mp4 = `${OUT}/${label}.mp4`;
  const dur = parseFloat(execFileSync(FFPROBE, ["-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1",mp4],{env:ENV,encoding:"utf8"}).trim());
  const stamps:number[]=[]; for(let t=0.25;t<dur;t+=0.6)stamps.push(t);
  const tiles:any[]=[]; const cw=150,ch=267,cols=Math.ceil(Math.sqrt(stamps.length*9/16*1.2));
  let mn=255,black=0;
  for(let i=0;i<stamps.length;i++){
    execFileSync(FFMPEG,["-y","-i",mp4,"-ss",stamps[i].toFixed(2),"-frames:v","1","-update","1","-vf",`scale=${cw}:${ch}`,"-q:v","4",`/tmp/_tb.jpg`],{env:ENV,stdio:["ignore","ignore","ignore"]});
    const {data}=await sharp("/tmp/_tb.jpg").greyscale().resize(16,16).raw().toBuffer({resolveWithObject:true});
    const m=data.reduce((a,b)=>a+b,0)/data.length; if(m<mn)mn=m; if(m<6)black++;
    tiles.push({input:await sharp("/tmp/_tb.jpg").toBuffer(),left:(i%cols)*(cw+3)+3,top:Math.floor(i/cols)*(ch+3)+3});
  }
  const rows=Math.ceil(stamps.length/cols);
  await sharp({create:{width:cols*(cw+3)+3,height:rows*(ch+3)+3,channels:3,background:{r:15,g:15,b:15}}}).composite(tiles).jpeg({quality:80}).toFile(`${SHEET}/${label}.sheet.jpg`);
  console.log(`${label.padEnd(18)} ${dur.toFixed(1)}s ${stamps.length} frames minLuma=${mn.toFixed(0)} black<6=${black}`);
}
