/* Original-colour display only. Detection continues to use TIFF.data / Engine's grayscale pipeline.
 * Geometry follows Engine.rotate: same canvas size, centre, inverse rotation and clamped edges.
 * No channel-specific contrast, gamma, inversion, synthetic colouring or network dependencies. */
(function(G) {
  'use strict';
  function mapper(w,h,deg) {
    const a=-deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=(w-1)/2,cy=(h-1)/2;
    return (x,y)=>({x:Math.max(0,Math.min(Math.max(0,w-1.001),c*(x-cx)-s*(y-cy)+cx)),y:Math.max(0,Math.min(Math.max(0,h-1.001),s*(x-cx)+c*(y-cy)+cy))});
  }
  function toImageData(rgb,w,h,deg) {
    const out=new ImageData(w,h),d=out.data,n=w*h;
    if(!deg){for(let i=0;i<n;i++){d[i*4]=rgb[i*3];d[i*4+1]=rgb[i*3+1];d[i*4+2]=rgb[i*3+2];d[i*4+3]=255;}return out;}
    const point=mapper(w,h,deg);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const p=point(x,y),x0=Math.floor(p.x),y0=Math.floor(p.y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=p.x-x0,fy=p.y-y0;
      const a=(y0*w+x0)*3,b=(y0*w+x1)*3,c=(y1*w+x0)*3,e=(y1*w+x1)*3,j=(y*w+x)*4;
      for(let k=0;k<3;k++)d[j+k]=Math.round((rgb[a+k]*(1-fx)+rgb[b+k]*fx)*(1-fy)+(rgb[c+k]*(1-fx)+rgb[e+k]*fx)*fy);
      d[j+3]=255;
    }
    return out;
  }
  // Background colour for contrast of annotation frames/dividers, sampled inside the displayed crop.
  function isDark(rgb,w,h,crop,deg) {
    const point=mapper(w,h,deg),hist=new Uint32Array(256),step=Math.max(1,Math.ceil(Math.sqrt(crop.w*crop.h/10000)));let n=0;
    for(let y=crop.y;y<crop.y+crop.h;y+=step)for(let x=crop.x;x<crop.x+crop.w;x+=step){
      const p=point(x,y),i=(Math.round(p.y)*w+Math.round(p.x))*3;
      hist[Math.round(.299*rgb[i]+.587*rgb[i+1]+.114*rgb[i+2])]++;n++;
    }
    let sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=n/2)return i<128;}return false;
  }
  function thumbnail(rgb,w,h,maxDim) {
    const scale=Math.min(1,maxDim/Math.max(w,h)),cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale)),id=new ImageData(cw,ch);
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
      const i=(Math.min(h-1,Math.floor(y/scale))*w+Math.min(w-1,Math.floor(x/scale)))*3,j=(y*cw+x)*4;
      id.data[j]=rgb[i];id.data[j+1]=rgb[i+1];id.data[j+2]=rgb[i+2];id.data[j+3]=255;
    }
    return id;
  }
  G.Colour={toImageData,isDark,thumbnail};
})(window);
