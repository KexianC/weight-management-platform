import { createHash } from 'node:crypto';
import type { VisionImage } from './vision-ocr';
// Remove metadata containers, never claim automatic face/name redaction.
// No image is decoded through a shell, URL, browser, or third-party service.
export function minimizeBodyImage(image: VisionImage): VisionImage & { sha256: string } {
  const source = image.bytes;
  if (!Buffer.isBuffer(source) || source.length < 8 || source.length > 10*1024*1024) throw new Error('IMAGE_INVALID');
  const chunks: Buffer[] = [];
  if (image.mimeType === 'image/png') {
    if (!source.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('IMAGE_INVALID');
    chunks.push(source.subarray(0,8)); let pos=8, ended=false, header=false, data=false;
    while (pos+12<=source.length) {
      const length=source.readUInt32BE(pos), end=pos+12+length, type=source.toString('ascii',pos+4,pos+8);
      if (end>source.length || !/^[A-Za-z]{4}$/.test(type) || ['acTL','fcTL','fdAT'].includes(type)) throw new Error('IMAGE_INVALID');
      if (type==='IHDR') { if(header || length!==13 || pos!==8)throw new Error('IMAGE_INVALID'); header=true; }
      if (type==='IDAT')data=true;
      if (['IHDR','PLTE','tRNS','IDAT','IEND'].includes(type))chunks.push(source.subarray(pos,end));
      else if (type[0]===type[0].toUpperCase())throw new Error('IMAGE_INVALID');
      pos=end;
      if(type==='IEND'){if(length!==0 || pos!==source.length)throw new Error('IMAGE_INVALID');ended=true;break;}
    }
    if(!header || !data || !ended)throw new Error('IMAGE_INVALID');
  } else if(image.mimeType==='image/jpeg') {
    if(source[0]!==255 || source[1]!==216)throw new Error('IMAGE_INVALID');
    chunks.push(source.subarray(0,2));let pos=2,ended=false;
    while(pos<source.length){
      const start=pos;
      if(source[pos++]!==255)throw new Error('IMAGE_INVALID');
      while(source[pos]===255)pos++;
      const marker=source[pos++];
      if(marker===217){chunks.push(source.subarray(start,pos));if(pos!==source.length)throw new Error('IMAGE_INVALID');ended=true;break;}
      if(marker===0 || marker===216 || marker>=208&&marker<=215 || pos+2>source.length)throw new Error('IMAGE_INVALID');
      const length=source.readUInt16BE(pos),end=pos+length;
      if(length<2 || end>source.length)throw new Error('IMAGE_INVALID');
      // Retain only a canonical Adobe color-transform APP14, never an arbitrary metadata segment.
      if(marker===238){
        if(length!==14 || source.toString('ascii',pos+2,pos+7)!=='Adobe' || source.readUInt16BE(pos+7)!==100 || source[pos+13]>2)throw new Error('IMAGE_INVALID');
        const adobe=Buffer.from(source.subarray(start,end));
        const offset=adobe.length-12;
        adobe.writeUInt16BE(0,offset+7);adobe.writeUInt16BE(0,offset+9);chunks.push(adobe);
      }else if(!(marker>=224&&marker<=239) && marker!==254)chunks.push(source.subarray(start,end));
      pos=end;
      if(marker===218){
        const scan=pos;
        while(pos<source.length){
          if(source[pos]!==255){pos++;continue;}
          const next=source[pos+1];
          if(next===0 || next>=208&&next<=215){pos+=2;continue;}
          if(next===255){pos++;continue;}
          break;
        }
        chunks.push(source.subarray(scan,pos));
      }
    }
    if(!ended)throw new Error('IMAGE_INVALID');
  } else throw new Error('Only single PNG/JPEG body report supported');
  const bytes=Buffer.concat(chunks);
  return {bytes,mimeType:image.mimeType,sha256:createHash('sha256').update(bytes).digest('hex')};
}
