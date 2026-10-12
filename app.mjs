import {DATASET,normalize,initialState,answer,activeMistakes,beginReview,nextWord,sanitizeState} from './core.mjs';
const $=id=>document.getElementById(id);
const STORAGE='cijian:'+DATASET;
const words=await fetch('./words.json').then(r=>{if(!r.ok)throw Error('单词表加载失败');return r.json();}).catch(()=>{document.querySelector('main').innerHTML='<section class="complete-card"><h2>单词表暂时没有加载成功</h2><p>请刷新页面后重试。</p></section>';return [];});
const byId=new Map(words.map(w=>[w.id,w]));
const spellingSlots=document.createElement('div');spellingSlots.id='spelling-slots';spellingSlots.className='spelling-slots';
$('answer-input').hidden=true;$('answer-input').after(spellingSlots);
let slots=[];
function focusSpelling(){(slots.find(x=>!x.value)||slots.at(-1))?.focus();}
function syncSpelling(){spellingSlots._sync?.();}
function renderSpelling(word,result){
 const letters=Array.from(normalize(word.word));const editable=letters.filter(c=>/[a-z0-9]/i.test(c));
 document.querySelector('.input-label').textContent='共 '+editable.length+' 个字母'+(letters.includes(' ')?'（空格已标出）':'')+' · 每格填写一个字母';
 spellingSlots.replaceChildren();slots=[];const draft=Array.from(normalize($('answer-input').value));
 letters.forEach((c,i)=>{
  if(!/[a-z0-9]/i.test(c)){const s=textNode('span',c===' '?'':c,'letter-separator'+(c===' '?' space':''));spellingSlots.append(s);return;}
  const input=document.createElement('input');input.type='text';input.className='letter-slot';input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','none');input.setAttribute('aria-label','第 '+(slots.length+1)+' 个字母');input.disabled=!!result;input.value=draft[i]||'';
  const index=slots.length;slots.push(input);spellingSlots.append(input);
  input.onfocus=()=>input.select();
  input.oninput=()=>{const text=normalize(input.value).replace(/[^a-z0-9]/g,'');if(text.length>1){for(let n=0;n<text.length&&index+n<slots.length;n++)slots[index+n].value=text[n];}else input.value=text;syncSpelling();if(text)slots[Math.min(index+text.length,slots.length-1)]?.focus();};
  input.onkeydown=e=>{if(e.key==='Backspace'&&!input.value&&index){e.preventDefault();slots[index-1].value='';slots[index-1].focus();syncSpelling();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();slots[index+(e.key==='ArrowLeft'?-1:1)]?.focus();}};
  input.onpaste=e=>{e.preventDefault();const chars=Array.from(normalize(e.clipboardData.getData('text')).replace(/[^a-z0-9]/g,''));chars.slice(0,slots.length-index).forEach((x,n)=>slots[index+n].value=x);syncSpelling();slots[Math.min(index+chars.length,slots.length-1)]?.focus();};
 });
 // Separators belong to the spelling and are preserved without asking learners to type them.
 const sync=()=>{let n=0;$('answer-input').value=letters.map(c=>/[a-z0-9]/i.test(c)?slots[n++].value||' ':c).join('').trim();$('answer-input').dispatchEvent(new Event('input'));};
 spellingSlots._sync=sync;
}
let state=initialState(),storageOK=true,started=false,filter='active',voices=[],speakingId=0,autoTimer,toastTimer,routeWriting=false;
let pronunciationAudio=null,audioTimeout,readyAudio=null,playTimer;
function accentName(accent=state.settings.accent){return accent==='en-GB'?'英式':'美式';}
function updateAccentButtons(){for(const [id,accent] of [['accent-uk','en-GB'],['accent-us','en-US']])$(id).setAttribute('aria-pressed',String(state.settings.accent===accent));}
function chooseAccent(accent){state.settings.accent=accent;save();updateAccentButtons();started=true;$('start-overlay').classList.add('hidden');speakWord(currentWord());if(!$('answer-input').disabled)focusSpelling();}
try{const raw=localStorage.getItem(STORAGE);if(raw)state=sanitizeState(JSON.parse(raw),words);}catch(e){storageOK=false;$('storage-alert').textContent='浏览器中的进度无法读取。当前练习仍可使用，请导出备份以免丢失。';$('storage-alert').classList.remove('hidden');}
function save(){
 state.savedAt=new Date().toISOString();
 try{localStorage.setItem(STORAGE,JSON.stringify(state));storageOK=true;$('save-status').textContent='进度已保存';$('storage-alert').classList.add('hidden');}
 catch{storageOK=false;$('save-status').textContent='未能保存';$('storage-alert').textContent='当前浏览器无法保存进度。请在设置中导出进度备份，避免关闭后丢失。';$('storage-alert').classList.remove('hidden');}
}
try{if(!localStorage.getItem(STORAGE+':clear-speech-v2')){state.settings.rate=.65;localStorage.setItem(STORAGE+':clear-speech-v2','1');save();}}catch{}
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3500);}
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');const u=document.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href','#'+name);s.append(u);return s;}
function textNode(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function currentWord(){if(state.view==='review')return state.session&&!state.session.finished?byId.get(state.session.ids[state.session.index]):null;return words[state.cursor]||null;}
function cleanMeaning(text){return text.replace(/\b(?:n|v|vt|vi|adj|a|adv|prep|pron|aux|num|interj|pref)\.\s*/g,'').replace(/(?:adv|n|adj|v)\//g,'').replace(/（[^）]*[a-zA-Z][^）]*）/g,'').replace(/\([^)]*[a-zA-Z][^)]*\)/g,'').trim();}
function matchedDraft(word){return state.draft?.id===word?.id&&state.draft.review===(state.view==='review')?state.draft:null;}
function getResult(word){return matchedDraft(word)?.result||(state.view==='learn'?state.results[word.id]:null)||null;}
function route(){if(state.view==='notebook')return '#/notebook';if(state.view==='review'){return '#/review/'+(state.session?.finished?'done':(state.session?.index||0)+1);}return '#/learn/'+(state.cursor>=words.length?'done':state.cursor+1);}
function setRoute(replace=false){const hash=route();if(location.hash===hash)return;routeWriting=true;history[replace?'replaceState':'pushState'](null,'',hash);routeWriting=false;}
function loadRoute(){
 const path=location.hash.slice(1).split('/').filter(Boolean);
 if(path[0]==='notebook'){state.view='notebook';return;}
 if(path[0]==='learn'){
  if(path[1]==='done'&&Object.keys(state.results).length===words.length){state.cursor=words.length;state.view='learn';return;}
  const index=Number(path[1])-1;if(Number.isInteger(index)&&index>=0&&index<words.length){state.cursor=index;state.view='learn';return;}
 }
 if(path[0]==='review'&&state.session){state.view='review';if(path[1]==='done'&&state.session.finished)return;const index=Number(path[1])-1;if(Number.isInteger(index)&&index>=0&&index<state.session.ids.length){state.session.index=index;state.session.finished=false;return;}}
}
function updateSummary(){
 const entries=Object.values(state.results),done=entries.length,correct=entries.filter(r=>r.correct).length,pending=activeMistakes(state).length;
 $('learned-count').textContent=done.toLocaleString('en-US');$('progress-fill').style.width=100*done/words.length+'%';$('accuracy').textContent=done?Math.round(100*correct/done)+'%':'—';
 $('resume-label').textContent=state.cursor>=words.length?'全部完成':'第 '+(state.cursor+1)+' 词 · 索引 '+(words[state.cursor]?.indexPage||'')+' 页';
 for(const id of ['nav-count','mistake-count'])$(id).textContent=pending;
 $('mistake-description').replaceChildren(...(pending?[textNode('span',pending+' 个词等你再记一次。'),document.createElement('br'),textNode('span','每一次复习，都离记住更近。')]:[textNode('span','写错也没关系，'),document.createElement('br'),textNode('span','下次一起把它记住。')]));
 $('review-start').disabled=!pending;$('notebook-review').disabled=!pending;$('complete-review').disabled=!pending;
 $('learn-nav').classList.toggle('active',state.view!=='notebook');$('notebook-nav').classList.toggle('active',state.view==='notebook');
}
function renderFeedback(result,word){
 const box=$('answer-feedback');box.className='feedback'+(result.correct?'':' wrong');box.replaceChildren();
 if(result.correct){box.append(textNode('strong','正确，记住这个感觉。'),textNode('div',word.word,'answer-reveal'));}
 else{box.append(textNode('strong','错误，正确的单词是：'),textNode('div',word.word,'answer-reveal'),textNode('div','已加入记错本，下次可以再次复习。','feedback-small'));}
 const wrap=document.querySelector('.input-wrap');wrap.className='input-wrap '+(result.correct?'correct':'wrong');$('input-icon').replaceChildren(icon(result.correct?'check':'close'));
}
function render(){
 if(!words.length)return;
 clearTimeout(autoTimer);updateSummary();const word=currentWord(),isNotebook=state.view==='notebook',complete=!isNotebook&&!word;
 $('practice-view').classList.toggle('hidden',isNotebook||complete);$('notebook-view').classList.toggle('hidden',!isNotebook);$('complete-view').classList.toggle('hidden',!complete);
 $('page-title').replaceChildren(textNode('span',isNotebook?'再见一次，':state.view==='review'?'再听一次，':'听见它，'),document.createTextNode(isNotebook?'记得更牢。':state.view==='review'?'就近一步。':'拼出来。'));
 $('page-title').firstChild.style.color='var(--ink)';
 $('page-description').textContent=isNotebook?'错误是记忆的起点，不是终点。':state.view==='review'?'把不太熟悉的词，练成自己的。':'一天记住一点，让单词慢慢成为你的。';
 if(isNotebook){stopSpeech();renderNotebook();return;}
 if(complete){stopSpeech();renderComplete();return;}
 const review=state.view==='review';
 $('mode-label').textContent=review?'错词复习':'顺序练习';$('position').textContent=review?'第 '+(state.session.index+1)+' / '+state.session.ids.length+' 词':'第 '+(state.cursor+1)+' / '+words.length+' 词';
 const chinese=cleanMeaning(word.meaning);$('meaning').textContent=chinese;$('meaning').classList.toggle('long',chinese.length>23);
 $('source-line').textContent='正文 '+word.bodyPage+' 页 · 索引 '+word.indexPage+' 页';
 const draft=matchedDraft(word),result=getResult(word);
 $('answer-input').value=draft?.text||result?.answer||'';$('answer-input').disabled=!!result;renderSpelling(word,result);
 document.querySelector('.input-wrap').className='input-wrap';$('input-icon').replaceChildren();$('answer-feedback').className='feedback hidden';
 if(result)renderFeedback(result,word);
 $('submit-answer').replaceChildren(textNode('span',result?(review&&state.session.index===state.session.ids.length-1||!review&&state.cursor===words.length-1?'完成这一轮':'下一个单词'):'提交拼写'),icon('arrow'));
 $('key-hint').replaceChildren(textNode('kbd','Enter'),document.createTextNode(result?' 下一个单词':' 提交拼写'));
 $('start-overlay').classList.toggle('hidden',started);
 $('start-title').textContent=state.savedAt?'从上次的地方，继续':'给耳朵一个开始';
 $('start').replaceChildren(document.createTextNode(state.savedAt?'继续练习':'开始练习'),icon('arrow'));
 updateAccentButtons();$('play-label').textContent='重播'+accentName()+'发音';$('speech-status').textContent=started?'点击英式或美式，可以对比两种发音。':'点击开始，听听这个单词。';
 if(started){if(state.settings.auto&&!result)autoTimer=setTimeout(()=>speakWord(word),180);requestAnimationFrame(()=>result?$('submit-answer').focus():focusSpelling());}
}
function renderComplete(){
 const review=state.view==='review';const remaining=activeMistakes(state).length;
 $('complete-title').textContent=review?'这一轮，复习完成。':'3607 词，一步步走完了。';
 $('complete-text').textContent=review?'本轮复习 '+state.session.ids.length+' 个词，正确 '+state.session.correct+' 次。'+(remaining?'记错本还有 '+remaining+' 个词，继续巩固。':'这轮错词已经复习正确，继续保持。'):'已答 '+Object.keys(state.results).length+' 个词条。'+(remaining?'还有 '+remaining+' 个错词等待复习。':'记错本暂时没有待复习词。');
 $('complete-learn').textContent=state.cursor>=words.length?'再从第一个词开始':'返回顺序练习';
}
function notebookItems(){const query=normalize($('search').value);return Object.entries(state.mistakes).filter(([,m])=>filter==='mastered'?m.mastered:!m.mastered).filter(([,m])=>{const w=byId.get(m.wordId);return w&&(normalize(w.word).includes(query)||w.meaning.includes($('search').value.trim()));}).sort((a,b)=>b[1].wrongCount-a[1].wrongCount||b[1].lastAt.localeCompare(a[1].lastAt));}
function renderNotebook(){
 const all=Object.values(state.mistakes),pending=all.filter(m=>!m.mastered).length;
 $('active-count').textContent=pending;$('mastered-count').textContent=all.length-pending;$('notebook-summary').textContent=pending+' 个待复习词 · '+(all.length-pending)+' 个已复习正确';
 const items=notebookItems(),list=$('mistake-list');list.replaceChildren();$('notebook-empty').classList.toggle('hidden',items.length>0);
 $('empty-text').textContent=$('search').value.trim()?'没有找到匹配的词，试试其他关键词。':filter==='mastered'?'复习正确的词会留在这里，方便再次巩固。':'暂时没有待复习错词，继续你的拼写练习吧。';
 for(const [key,m] of items){
  const w=byId.get(m.wordId),row=textNode('article','','mistake-row'),details=document.createElement('div'),heading=textNode('h3',w.word,'mistake-word');
  const play=textNode('button','','word-play');play.append(icon('sound'));play.setAttribute('aria-label','播放 '+w.word+' 的发音');play.onclick=()=>{started=true;speakWord(w);};heading.append(play);details.append(heading,textNode('p',cleanMeaning(w.meaning),'mistake-meaning'));
  const info=textNode('div','','mistake-details');info.append(textNode('span','错误 '+m.wrongCount+' 次 · 正文 '+w.bodyPage+' 页 · '),textNode('span','上次写成：'+m.lastAnswer,'wrong-answer'));details.append(info);
  const controls=textNode('div','','mistake-controls');const review=textNode('button','练这个词','secondary-button');review.onclick=()=>startReview([w.id]);controls.append(review);
  const mark=textNode('button',m.mastered?'放回待复习':'已记住，收起','text-button');mark.onclick=()=>{state.mistakes[key].mastered=!m.mastered;save();updateSummary();renderNotebook();};controls.append(mark);row.append(details,controls);list.append(row);
 }
}
function stopSpeech(){clearTimeout(autoTimer);clearTimeout(audioTimeout);clearTimeout(playTimer);speakingId++;if(readyAudio){readyAudio.pause();readyAudio=null;}if(pronunciationAudio){pronunciationAudio.onplaying=null;pronunciationAudio.onended=null;pronunciationAudio.onerror=null;pronunciationAudio.pause();pronunciationAudio.removeAttribute('src');pronunciationAudio.load();pronunciationAudio=null;}if('speechSynthesis' in window)speechSynthesis.cancel();$('play').classList.remove('playing');}
function speechText(word){return word.word.replace(/[®™]/g,'');}
function speakWord(word){
 if(!word)return;stopSpeech();
 const token=speakingId,accent=state.settings.accent,label=accentName(accent),audio=new Audio();pronunciationAudio=audio;
 // Open the audio output before the word starts, including Bluetooth devices that take time to wake.
 const ready=new Audio('./audio-ready.wav'),readyAt=performance.now();readyAudio=ready;ready.play().catch(()=>{});
 audio.preload='auto';audio.defaultPlaybackRate=state.settings.rate;audio.preservesPitch=true;
 audio.src='https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(speechText(word))+'&type='+(accent==='en-GB'?'1':'2');
 audio.playbackRate=state.settings.rate;
 $('speech-status').textContent='准备播放：提示音后听完整的'+label+'发音。';
 let fallbackStarted=false;
 const fallback=()=>{if(token!==speakingId||fallbackStarted)return;fallbackStarted=true;clearTimeout(audioTimeout);audio.onplaying=null;audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();speakWithDevice(word,accent,token);};
 audio.onplaying=()=>{if(token!==speakingId)return;clearTimeout(audioTimeout);setTimeout(()=>ready.pause(),200);$('play').classList.add('playing');$('play-label').textContent='正在播放'+label+'发音';$('speech-status').textContent=label+'发音 · 点击另一种口音可以对比。';};
 audio.onended=()=>{if(token!==speakingId)return;$('play').classList.remove('playing');$('play-label').textContent='重播'+label+'发音';$('speech-status').textContent='点击英式或美式，可以对比两种发音。';};
 audio.onerror=fallback;audioTimeout=setTimeout(fallback,12000);
 let queued=false;
 audio.oncanplaythrough=()=>{if(token!==speakingId||queued||fallbackStarted)return;queued=true;let outputReadyAt=readyAt;if(ready.ended){ready.currentTime=0;ready.play().catch(()=>{});outputReadyAt=performance.now();}playTimer=setTimeout(()=>{if(token!==speakingId)return;audio.currentTime=0;audio.play().catch(error=>{if(token!==speakingId)return;if(error.name==='NotAllowedError'){clearTimeout(audioTimeout);ready.pause();$('play-label').textContent='点击播放'+label+'发音';$('speech-status').textContent='请点击发音按钮，允许浏览器开始播放。';}else fallback();});},Math.max(0,1000-(performance.now()-outputReadyAt)));};
 audio.load();
}
function speakWithDevice(word,accent,token){
 const label=accentName(accent);voices='speechSynthesis' in window?speechSynthesis.getVoices():[];
 const exact=voices.filter(v=>v.lang.replace('_','-').toLowerCase()===accent.toLowerCase());
 if(!exact.length){$('play').classList.remove('playing');$('play-label').textContent='重试'+label+'发音';$('speech-status').textContent=label+'音频暂时无法播放，请检查网络后重试。设备也未提供对应口音的备用语音。';return;}
 const utterance=new SpeechSynthesisUtterance(speechText(word));utterance.lang=accent;utterance.rate=state.settings.rate;utterance.voice=exact.find(v=>v.localService)||exact[0];
 utterance.onstart=()=>{if(token!==speakingId)return;$('play').classList.add('playing');$('play-label').textContent='正在播放'+label+'发音';$('speech-status').textContent='使用设备'+label+'语音。';};
 utterance.onend=()=>{if(token!==speakingId)return;$('play').classList.remove('playing');$('play-label').textContent='重播'+label+'发音';};
 utterance.onerror=()=>{if(token!==speakingId)return;$('play').classList.remove('playing');$('speech-status').textContent=label+'语音未能播放，请点击重试。';};
 speechSynthesis.resume();autoTimer=setTimeout(()=>{if(token===speakingId)speechSynthesis.speak(utterance);},650);
}
function learn(){stopSpeech();state.view='learn';save();setRoute();render();}
function notebook(){stopSpeech();state.view='notebook';save();setRoute();render();}
function startReview(ids){
 const list=ids||activeMistakes(state).map(([,m])=>m.wordId);
 if(!list.length){toast('暂时没有需要复习的错词');return;}
 stopSpeech();beginReview(state,list);started=true;save();setRoute();render();
}
function submit(){
 const w=currentWord();if(!w)return;
 const result=getResult(w);
 if(result){stopSpeech();nextWord(state,words.length);save();setRoute();render();return;}
 if(!$('answer-input').value.trim()){toast('先写下你听到的英文');focusSpelling();return;}
 const review=state.view==='review';const r=answer(state,w,$('answer-input').value,review);
 if(review){state.session.answered++;if(r.correct)state.session.correct++;}
 save();render();
}
function settings(){
 $('auto-speech').checked=state.settings.auto;$('speech-rate').value=String(state.settings.rate);$('speech-accent').value=state.settings.accent;$('jump-number').value=Math.min(words.length,state.cursor+1);
 $('resume-review-block').classList.toggle('hidden',!state.session||state.session.finished||state.view==='review');$('settings').showModal();
}
$('answer-form').onsubmit=e=>{e.preventDefault();submit();};
$('answer-input').addEventListener('input',()=>{const w=currentWord();if(!w)return;state.draft={id:w.id,review:state.view==='review',text:$('answer-input').value,result:null};save();});
$('play').onclick=()=>{started=true;$('start-overlay').classList.add('hidden');speakWord(currentWord());if(!$('answer-input').disabled)focusSpelling();};
$('start').onclick=()=>{started=true;$('start-overlay').classList.add('hidden');speakWord(currentWord());save();if($('answer-input').disabled)$('submit-answer').focus();else focusSpelling();};
$('learn-nav').onclick=learn;$('notebook-nav').onclick=notebook;$('notebook-open').onclick=notebook;$('empty-learn').onclick=learn;
document.querySelector('.brand').onclick=e=>{e.preventDefault();learn();};
for(const id of ['review-start','notebook-review','complete-review'])$(id).onclick=()=>startReview();
$('complete-learn').onclick=()=>{if(state.cursor>=words.length){state.cursor=0;state.draft=null;}learn();};
$('search').oninput=renderNotebook;
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));renderNotebook();});
$('settings-open').onclick=settings;$('settings-close').onclick=()=>$('settings').close();
$('settings').addEventListener('click',e=>{if(e.target===$('settings')){const rect=$('settings').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)$('settings').close();}});
$('auto-speech').onchange=()=>{state.settings.auto=$('auto-speech').checked;save();};
$('speech-rate').onchange=()=>{state.settings.rate=Number($('speech-rate').value);save();};
$('speech-accent').onchange=()=>{state.settings.accent=$('speech-accent').value;save();updateAccentButtons();if(started&&state.view!=='notebook')speakWord(currentWord());};
$('accent-uk').onclick=()=>chooseAccent('en-GB');$('accent-us').onclick=()=>chooseAccent('en-US');
$('resume-review').onclick=()=>{state.view='review';save();setRoute();$('settings').close();render();};
$('jump').onclick=()=>{const n=Number($('jump-number').value);if(!Number.isInteger(n)||n<1||n>words.length){$('backup-status').textContent='请输入 1–3607 之间的词条编号。';return;}stopSpeech();state.cursor=n-1;state.view='learn';state.draft=null;save();setRoute();$('settings').close();render();};
$('export-progress').onclick=()=>{
 save();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='词间_学习进度_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);$('backup-status').textContent='备份已导出，请妥善保管。';
};
$('import-progress').onclick=()=>$('backup-file').click();
$('backup-file').onchange=async()=>{
 const file=$('backup-file').files[0];if(!file)return;
 try{
  if(file.size>10000000)throw Error('备份文件过大，请选择词间导出的 JSON 备份。');
  const restored=sanitizeState(JSON.parse(await file.text()),words);
  if(!confirm('恢复备份会替换此浏览器当前的进度和记错本，是否继续？'))return;
  stopSpeech();state=restored;started=false;save();setRoute(true);$('settings').close();render();toast('已恢复备份，可以从上次的位置继续');
 }catch(e){$('backup-status').textContent=e.message||'备份无法读取，请选择词间导出的备份文件。';}finally{$('backup-file').value='';}
};
window.addEventListener('hashchange',()=>{if(routeWriting)return;stopSpeech();loadRoute();save();render();});
window.addEventListener('pagehide',()=>{save();stopSpeech();});
window.addEventListener('storage',e=>{if(e.key===STORAGE&&e.newValue){toast('另一个窗口更新了学习进度。请刷新当前页面以继续最新进度。');}});
window.addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='p'){e.preventDefault();started=true;$('start-overlay').classList.add('hidden');speakWord(currentWord());}});
if('speechSynthesis' in window){voices=speechSynthesis.getVoices();speechSynthesis.addEventListener('voiceschanged',()=>{voices=speechSynthesis.getVoices();});}
if(words.length){loadRoute();setRoute(true);render();}

