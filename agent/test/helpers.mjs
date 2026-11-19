import vm from 'node:vm';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function synthetic(kind='dna'){
 const G={};const context=vm.createContext({window:G,Float32Array,Uint8Array,Uint16Array,ArrayBuffer,DataView,Math,console});
 G.L=(zh,en)=>en;G.LadderCache={start:()=>Promise.resolve(),data:{custom:[],favorites:[]},subscribe:()=>{},flush:async()=>true,get status(){return 'saved';},change:()=>{}};
 for(const file of ['ladders.js','engine.js','demo.js'])vm.runInContext(await fs.readFile(path.join(root,'js',file),'utf8'),context);
 return Buffer.from(G.Demo.encodeTiff16(kind==='protein'?G.Demo.makeProteinGel():G.Demo.makeGel()));
}
export function completeSpec(analysis){return {schemaVersion:'1',expectedRevision:analysis.revision,gelType:analysis.gelType.value,orientationConfirmed:true,laneLabels:analysis.lanes.filter(l=>!l.hidden).map(l=>({laneId:l.id,text:l.marker?'M':'Sample '+l.number})),markerPolicy:'specified',markers:analysis.markers.map(m=>({laneId:m.laneId,ladderId:m.ladderId,unit:analysis.gelType.value==='protein'?'kDa':'bp'})),layout:{fontPt:7},exports:{dpi:300,formats:['png','svg','tiff','pptx']},acknowledgements:['SOURCE_SATURATION','LABEL_OVERLAP','FONT_SUBSTITUTION']};}
