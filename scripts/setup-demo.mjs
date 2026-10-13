// Generate only original demo inputs and pinned third-party assets.
import {mkdir,writeFile,copyFile,cp,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
for(const dir of ['private/national','private/library','private/bookshelf','private/search','public/vendor/katex'])await mkdir(path.join(root,dir),{recursive:true});
async function create(name,data){try{await writeFile(name,JSON.stringify(data),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
for(const folder of ['national','library','bookshelf'])await create(`private/${folder}/manifest.json`,[]);
const paper=JSON.parse(await readFile('content/migration/demo/paper.json','utf8'));
const records=paper.unit_ids.map(unit=>({id:'national-demo:q'+unit,type:'question',paper_id:'national-demo',title:paper.paper_name+' · 第'+unit+'题',unit,year:null,collection:'原创示例',module:'演示',topics:[],methods:[],rule:paper.algorithm,version:'seed',status:'待复核',D:null,B:null,optional:false,source:paper.source,summary:'',search_text:'',url:'/national/demo/试卷难度分析.html#q='+unit}));
await create('private/search/index.json',{schema:'studio-index-v1',question_count:records.length,resource_count:0,records});
const vendor='node_modules/katex';
for(const name of ['katex.min.js','katex.min.css'])await copyFile(`${vendor}/dist/${name}`,`public/vendor/katex/${name}`);
await cp(`${vendor}/dist/fonts`,'public/vendor/katex/fonts',{recursive:true});
await copyFile(`${vendor}/LICENSE`,'public/vendor/katex/LICENSE');
console.log('Demo dependencies ready. Existing private input files were preserved.');
