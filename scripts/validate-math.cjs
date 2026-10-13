// Use the same pinned KaTeX package as the browser assets.
const fs=require('node:fs');const katex=require('katex');
for(const {tex,display} of JSON.parse(fs.readFileSync(0,'utf8')))
 katex.renderToString(tex,{throwOnError:true,displayMode:display,trust:false,strict:false,maxExpand:1000});
