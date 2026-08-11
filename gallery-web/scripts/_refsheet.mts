import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import path from "node:path";
const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const F=path.join(COMP,"ffmpeg"),FP=path.join(COMP,"ffprobe");const ENV={...process.env,DYLD_LIBRARY_PATH:COMP};
mkdirSync("/tmp/trackb-sheets",{recursive:true});
for(const label of ["REFINED"]){
 const mp4=`/tmp/trackb-out/${label}.mp4`;
 const dur=parseFloat(execFileSync(FP,["-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1",mp4],{env:ENV,encoding:"utf8"}).trim());
 const st=[];for(let t=0.25;t<dur;t+=0.6)st.push(t);
 const cw=150,ch=267,cols=Math.ceil(Math.sqrt(st.length*9/16*1.2));const tiles=[];let mn=255,bl=0;
 for(let i=0;i<st.length;i++){execFileSync(F,["-y","-i",mp4,"-ss",st[i].toFixed(2),"-frames:v","1","-update","1","-vf",`scale=${cw}:${ch}`,"-q:v","4","/tmp/_r.jpg"],{env:ENV,stdio:["ignore","ignore","ignore"]});const {data}=await sharp("/tmp/_r.jpg").greyscale().resize(16,16).raw().toBuffer({resolveWithObject:true});const m=data.reduce((a,b)=>a+b,0)/data.length;if(m<mn)mn=m;if(m<6)bl++;tiles.push({input:await sharp("/tmp/_r.jpg").toBuffer(),left:(i%cols)*(cw+3)+3,top:Math.floor(i/cols)*(ch+3)+3});}
 const rows=Math.ceil(st.length/cols);
 await sharp({create:{width:cols*(cw+3)+3,height:rows*(ch+3)+3,channels:3,background:{r:15,g:15,b:15}}}).composite(tiles).jpeg({quality:80}).toFile(`/tmp/trackb-sheets/${label}.sheet.jpg`);
 console.log(`${label} ${dur.toFixed(1)}s ${st.length} frames minLuma=${mn.toFixed(0)} black<6=${bl}`);
}
