/* 无依赖字符串扫描器：跳过注释，递归扫描模板表达式，提取中文文案。 */
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');
const files=['js/ui.js','js/save-ui.js','js/feedback.js','js/tutorial.js','js/events.js','js/data.js','js/game.js','js/finance.js','js/staff.js','index.html'];const rows=[];
for(const file of files){const sourceFile=path.join(process.env.TEXT_AUDIT_SOURCE_DIR || root,file);if(!fs.existsSync(sourceFile))continue;const src=fs.readFileSync(sourceFile,'utf8');
 const add=(value,start)=>{for(const m of value.matchAll(/(?:aria-label|placeholder|title|alt|content)="([^"]*)"/g)){if(/[\u3400-\u9fff]/.test(m[1]))rows.push({file,line:src.slice(0,start).split('\n').length,text:m[1]});}const text=value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();if(/[\u3400-\u9fff]/.test(text))rows.push({file,line:src.slice(0,start).split('\n').length,text});};
 if(file.endsWith('.html')){add(src.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[^]*?-->/g,''),0);continue;}
 let i=0;
 function quoted(q){const start=i++;let value='';while(i<src.length){const c=src[i++];if(c==='\\'){value+=c+(src[i++]||'');continue;}if(c===q)break;if(q==='`'&&c==='$'&&src[i]==='{'){i++;value+='${…}';code(true);continue;}value+=c;}add(value,start);}
 function code(inExpr=false){let depth=0;while(i<src.length){const c=src[i];if(c==='/'&&src[i+1]==='/'){i=src.indexOf('\n',i);if(i<0){i=src.length;return;}continue;}if(c==='/'&&src[i+1]==='*'){const end=src.indexOf('*/',i+2);i=end<0?src.length:end+2;continue;}if(c==='/' && /[=(:,[!&|?;{}]/.test(src.slice(0,i).trimEnd().slice(-1))){i++;let bracket=false;while(i<src.length){const r=src[i++];if(r==='\\'){i++;continue;}if(r==='[')bracket=true;if(r===']')bracket=false;if(r==='/'&&!bracket)break;}while(/[a-z]/i.test(src[i]||'')&&i<src.length)i++;continue;}if(['"',"'",'`'].includes(c)){quoted(c);continue;}i++;if(inExpr){if(c==='{')depth++;if(c==='}'){if(!depth)return;depth--;}}}}
 code();
}
const target=process.argv[2]||'_screens/t03-text-after.md';const unique=[...new Map(rows.map(r=>[r.file+':'+r.line+':'+r.text,r])).values()];
fs.mkdirSync(path.dirname(path.resolve(root,target)),{recursive:true});fs.writeFileSync(path.resolve(root,target),'# 玩家文案清单\n\n共 '+unique.length+' 条。模板中的动态数值标记为占位，未执行游戏。需结合页面及事件检查。\n\n'+unique.map((r,i)=>`${i+1}. **${r.file}:${r.line}** ${r.text.replace(/\|/g,'\\|')}`).join('\n\n')+'\n');
fs.writeFileSync(path.resolve(root,target.replace(/\.md$/,'.json')),JSON.stringify(unique,null,2));console.log('已提取 '+unique.length+' 条文案');
