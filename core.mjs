export const DATASET='index-312-326-v1';
export const normalize=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[®™]/g,'').replace(/[‘’]/g,"'").replace(/[‐‑–—]/g,'-').trim().replace(/\s+/g,' ').toLowerCase();
export function initialState(){return {version:1,dataset:DATASET,cursor:0,results:{},mistakes:{},session:null,view:'learn',draft:null,settings:{auto:true,rate:.65,accent:'en-GB'},savedAt:null};}
export function answer(state,word,text,review=false){
 if(!text.trim())return null;
 const correct=normalize(text)===normalize(word.word);
 const at=new Date().toISOString();
 const result={correct,answer:text,at};
 const key=normalize(word.word);
 if(!review)state.results[word.id]=result;
 if(!correct){
  const old=state.mistakes[key];
  state.mistakes[key]={wordId:word.id,wrongCount:(old?.wrongCount||0)+1,lastAnswer:text,lastAt:at,mastered:false,reviewCorrect:0};
 }else if(review&&state.mistakes[key]){
  state.mistakes[key].mastered=true;
  state.mistakes[key].reviewCorrect=(state.mistakes[key].reviewCorrect||0)+1;
 }
 state.draft={id:word.id,review,text,result};
 return result;
}
export function activeMistakes(state){return Object.entries(state.mistakes).filter(([,m])=>!m.mastered).sort((a,b)=>b[1].wrongCount-a[1].wrongCount||b[1].lastAt.localeCompare(a[1].lastAt));}
export function beginReview(state,ids){state.session={ids:[...ids],index:0,correct:0,answered:0,finished:false};state.view='review';state.draft=null;}
export function nextWord(state,total){
 state.draft=null;
 if(state.view==='review'&&state.session){
  if(state.session.index+1>=state.session.ids.length){state.session.finished=true;return false;}
  state.session.index++;return true;
 }
 if(state.cursor+1>=total){state.cursor=total;return false;}
 state.cursor++;return true;
}
export function sanitizeState(raw,words){
 if(!raw||raw.version!==1||raw.dataset!==DATASET||!Number.isInteger(raw.cursor)||raw.cursor<0||raw.cursor>words.length)throw Error('这份备份不属于当前单词表，或内容已损坏。');
 const state=initialState();state.cursor=raw.cursor;
 const ids=new Set(words.map(w=>w.id));
 const validResult=x=>x&&typeof x.correct==='boolean'&&typeof x.answer==='string'&&x.answer.length<=500&&typeof x.at==='string';
 for(const [id,r] of Object.entries(raw.results||{}))if(ids.has(id)&&validResult(r))state.results[id]={correct:r.correct,answer:r.answer,at:r.at};
 for(const [key,m] of Object.entries(raw.mistakes||{})){
  if(!m||!ids.has(m.wordId)||typeof m.lastAnswer!=='string'||m.lastAnswer.length>500||typeof m.lastAt!=='string'||!Number.isInteger(m.wrongCount)||m.wrongCount<1)continue;
  const word=words.find(w=>w.id===m.wordId);
  if(normalize(word.word)!==key)continue;
  state.mistakes[key]={wordId:m.wordId,lastAnswer:m.lastAnswer,lastAt:m.lastAt,wrongCount:m.wrongCount,mastered:m.mastered===true,reviewCorrect:Math.max(0,Number(m.reviewCorrect)||0)};
 }
 const opts=raw.settings||{};state.settings={auto:opts.auto!==false,rate:[.65,.85,1].includes(opts.rate)?opts.rate:.65,accent:['en-GB','en-US'].includes(opts.accent)?opts.accent:'en-GB'};
 if(raw.session&&Array.isArray(raw.session.ids)&&raw.session.ids.length&&raw.session.ids.every(id=>ids.has(id))&&Number.isInteger(raw.session.index)&&raw.session.index>=0&&raw.session.index<raw.session.ids.length){
  const q=raw.session;state.session={ids:q.ids,index:q.index,correct:Math.max(0,Number(q.correct)||0),answered:Math.max(0,Number(q.answered)||0),finished:q.finished===true};
 }
 state.view=['learn','review','notebook'].includes(raw.view)?raw.view:'learn';if(state.view==='review'&&!state.session)state.view='learn';
 if(raw.draft&&ids.has(raw.draft.id)&&typeof raw.draft.text==='string'&&raw.draft.text.length<=500){const d=raw.draft;state.draft={id:d.id,review:d.review===true,text:d.text,result:validResult(d.result)?{...d.result}:null};}
 state.savedAt=typeof raw.savedAt==='string'?raw.savedAt:null;return state;
}

