(function(){
'use strict';
const get=id=>document.getElementById(id);
const datasets={
 fold:[
  {src:"https://raw.githubusercontent.com/Shunsuke-max/foldlens-portfolio/main/assets/real-af3-case1-workspace.png",alt:'FoldLensの実データ解析ワークスペース',caption:'3D構造と予測位置誤差（PAE）の連動表示'},
  {src:"https://raw.githubusercontent.com/Shunsuke-max/foldlens-portfolio/main/assets/real-af3-case1-models.png",alt:'FoldLensの5モデル比較画面',caption:'5モデルの結合界面は一致する一方、界面PAE中央値は11.0 Å。'},
  {src:"https://raw.githubusercontent.com/Shunsuke-max/foldlens-portfolio/main/assets/real-af3-case2-divergence.png",alt:'FoldLensの3鎖複合体の配置比較画面',caption:'3鎖複合体：モデル間で鎖の配置が大きく異なる。'},
  {src:"https://raw.githubusercontent.com/Shunsuke-max/foldlens-portfolio/main/assets/demo-tour-step5-agent.png",alt:'FoldLensの根拠提示型AIエージェント画面',caption:'6つの解析ツールに基づく回答と対象外質問の遮断（事前収録デモ）。'}
 ],
 part:[
  {src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/home.jpg",alt:'Part5 Proのホーム画面',title:'学習の入口',caption:'実力診断と演習'},
  {src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/training.jpg",alt:'Part5 Proのトレーニング画面',title:'目的別の演習',caption:'弱点に応じた演習'},
  {src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/mock-question.png",alt:'Part5 Proの模試問題画面',title:'本番を想定した模試',caption:'制限時間付き模試'},
  {src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/feedback.png",alt:'Part5 Proの回答・解説画面',title:'解いて終わらない',caption:'解説と復習'}
 ]
};
const galleries=Array.from(document.querySelectorAll('[data-gallery]'));
function showImage(group,index){
 const item=datasets[group]?.[index];if(!item)return;
 const img=get(group+'Image');img.hidden=false;
 const notice=img.closest('.image-area')?.querySelector('.image-unavailable');
 if(notice)notice.hidden=true;
 img.alt=item.alt;img.src=item.src;
 get(group+'Caption').textContent=item.caption;
 if(group==='fold')get('foldImageLink').href=item.src;
 if(group==='part')get('partTitle').textContent=item.title;
 galleries.filter(b=>b.dataset.gallery===group).forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index)));
}
galleries.forEach(b=>b.addEventListener('click',()=>showImage(b.dataset.gallery,Number(b.dataset.index))));
for(const img of document.querySelectorAll('.image-area img')){
 function fail(){img.hidden=true;const notice=img.closest('.image-area')?.querySelector('.image-unavailable');if(notice)notice.hidden=false;}
 img.addEventListener('error',fail);
 if(img.complete&&!img.naturalWidth)fail();
}

const contacts=[84,104,103,92,81,110,81,80];
const clashNotes={0:'（局所的な原子衝突 2.02 Å を検出）',7:'（局所的な原子衝突 1.62 Å を検出）'};
const frames=Array.from(document.querySelectorAll('[data-frame]'));
frames.forEach(b=>b.addEventListener('click',()=>{
 const i=Number(b.dataset.frame);
 get('ensembleFrame').textContent='構造候補 '+(i+1)+' / 8'+(clashNotes[i]||'（2.2 Å 未満の原子衝突なし）');
 get('ensembleContacts').textContent=contacts[i]+' ペア';
 frames.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
}));

const phases=[
 ['標的と設計条件を定義する','文献・公開構造から結合部位と必要な性質を定義。'],
 ['条件を満たす構造候補を生成する','RFdiffusion系で構造候補を生成。'],
 ['構造に合うアミノ酸配列を設計する','ProteinMPNN・LigandMPNNで配列候補を推論。'],
 ['独立モデルで再予測して候補を選別する','AlphaFold 3・Boltz-2で再予測し、RMSD・PAE・原子衝突を評価。機能の実証には実験が必要。']
];
const phaseButtons=Array.from(document.querySelectorAll('[data-phase-button]'));
phaseButtons.forEach(b=>b.addEventListener('click',()=>{
 const i=Number(b.dataset.phaseButton);
 get('phaseTitle').textContent=phases[i][0];
 get('phaseText').textContent=phases[i][1];
 phaseButtons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 document.querySelectorAll('.pipeline-graphic [data-phase]').forEach(g=>g.classList.toggle('is-selected',Number(g.dataset.phase)===i));
}));

const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const skippedExhibits=new WeakSet();
const exhibits=Array.from(document.querySelectorAll('.exhibit'));
for(const el of exhibits){
 el.addEventListener('contentvisibilityautostatechange',ev=>{
  if(ev.skipped)skippedExhibits.add(el);
  else skippedExhibits.delete(el);
 });
}
let ticking=false;
function move(){
 ticking=false;
 for(const e of exhibits){
  if(skippedExhibits.has(e))continue;
  const rect=e.getBoundingClientRect();
  if(rect.bottom<0||rect.top>innerHeight){e.style.setProperty('--exhibit-shift','0px');continue;}
  const offset=motion.matches?0:Math.max(-24,Math.min(24,(rect.top+rect.height/2-innerHeight/2)*.06));
  e.style.setProperty('--exhibit-shift',offset.toFixed(1)+'px');
 }
}
function scheduleMove(){if(!ticking){ticking=true;requestAnimationFrame(move);}}
window.addEventListener('scroll',scheduleMove,{passive:true});
window.addEventListener('resize',scheduleMove,{passive:true});
move();
})();
