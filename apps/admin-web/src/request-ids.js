import {uuidv7} from './uuidv7.js';

const fingerprint=value=>{
 const text=JSON.stringify(value);let first=0x811c9dc5,second=0x9e3779b9;
 for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);first=Math.imul(first^code,0x01000193);second=Math.imul(second^code,0x85ebca6b)}
 return `${(first>>>0).toString(16).padStart(8,'0')}${(second>>>0).toString(16).padStart(8,'0')}`;
};

export function createRequestIds(storage=()=>window.sessionStorage,createId=uuidv7){
 const keys=new Map();
 const read=name=>{try{const value=JSON.parse(storage().getItem(`alsvid:request:${name}`)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return{}}};
 const write=(name,values)=>{try{storage().setItem(`alsvid:request:${name}`,JSON.stringify(values))}catch{}};
 return{
  get(name,payload){const signature=fingerprint(payload),memory=keys.get(name);if(memory?.has(signature))return memory.get(signature);const values=read(name);let id=values[signature];if(!id){id=createId();values[signature]=id;write(name,values)}let current=keys.get(name);if(!current){current=new Map();keys.set(name,current)}current.set(signature,id);return id},
  clear(name,payload){const signature=fingerprint(payload),values=read(name);delete values[signature];write(name,values);const memory=keys.get(name);memory?.delete(signature);if(memory&&!memory.size)keys.delete(name)}
 };
}
