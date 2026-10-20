'use strict';
// Explicit publication step: never upload the private tree or authenticated profile.
const fs=require('node:fs'),path=require('node:path');
const A=require('./analysis.cjs');
function exportStudy(source,destination){
  source=path.resolve(source);destination=path.resolve(destination);
  if(!path.relative(source,destination)||(!path.relative(source,destination).startsWith('..'+path.sep)&&!path.isAbsolute(path.relative(source,destination))))throw Error('Publication destination must be outside the private study');
  if(fs.existsSync(destination))throw Error('Publication destination must be new');
  const manifest=A.sanitizeEvidence(JSON.parse(fs.readFileSync(path.join(source,'manifest-private.json'),'utf8')));
  const runs=A.sanitizeEvidence(JSON.parse(fs.readFileSync(path.join(source,'runs.json'),'utf8')));
  fs.mkdirSync(destination,{recursive:true});
  const write=(name,value)=>{const file=path.join(destination,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  write('manifest.json',manifest);write('runs.json',runs);
  const analysis=A.analyze(runs);write('analysis.json',analysis);write('REPORT.txt',A.renderReport(analysis,{environment:manifest.environment}));
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink()||['workspace','.git','node_modules'].includes(entry.name))continue;
    const file=path.join(dir,entry.name);if(entry.isDirectory()){walk(file);continue;}
    if(!/\.(json|jsonl|txt|log)$/.test(entry.name)||fs.statSync(file).size>2*1024*1024)continue;
    const raw=fs.readFileSync(file,'utf8');let value;
    if(entry.name.endsWith('.json')){try{value=A.sanitizeEvidence(JSON.parse(raw));}catch{throw Error('Invalid JSON receipt: '+entry.name);}}
    else value=A.sanitizeEvidence(raw);
    write(path.join('receipts',path.relative(path.join(source,'private'),file)),value);
  }}
  walk(path.join(source,'private'));return destination;
}
module.exports={exportStudy};
if(require.main===module){try{if(process.argv.length!==4)throw Error('Usage: node export.cjs <private-study> <new-sanitized-directory>');console.log(exportStudy(process.argv[2],process.argv[3]));}catch(error){console.error(error.message);process.exitCode=1;}}
