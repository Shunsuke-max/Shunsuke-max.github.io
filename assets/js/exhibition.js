(function(){
'use strict';
const get=id=>document.getElementById(id);
const datasets={
fold:[
{src:"https://raw.githubusercontent.com/Shunsuke-max/foldlens-portfolio/main/assets/real-af3-case1-workspace.png",alt:'FoldLensの実データ解析ワークスペース',caption:'3D構造と予測誤差（PAE）を同じ画面で確認できます。画像をクリックすると拡大できます。'},
{src:"https://raw.githubusercontent.com/Shunsuke-max/foldlens-portfolio/main/assets/real-af3-case1-models.png",alt:'FoldLensの5モデル比較画面',caption:'5モデルの界面はよく一致しますが、界面PAEの中央値は11.0 Å。形状の一致と予測誤差を分けて見ます。'},
{src:"https://raw.githubusercontent.com/Shunsuke-max/foldlens-portfolio/main/assets/real-af3-case2-divergence.png",alt:'FoldLensの3鎖複合体の配置比較画面',caption:'別の3鎖複合体では、モデル間で配置が大きく異なりました。単一の予測構造だけで結論を出すことには注意が必要です。'}],
part:[
{src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/home.jpg",alt:'Part5 Proのホーム画面',title:'学習の入口',caption:'実力診断と短時間の演習から、次に行う学習を選べます。'},
{src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/training.jpg",alt:'Part5 Proのトレーニング画面',title:'目的別の演習',caption:'学習の目的に合わせて、文法・語彙や復習などの演習を選べます。'},
{src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/mock-question.png",alt:'Part5 Proの模試問題画面',title:'本番を想定する',caption:'時間制約のある四択演習で、現在の理解度を確認します。'},
{src:"https://raw.githubusercontent.com/Shunsuke-max/part5-pro-portfolio/main/assets/feedback.png",alt:'Part5 Proの回答・解説画面',title:'解いて終わらない',caption:'正答、語の意味、解説を確認し、次の学習につなげます。'}]
};
const galleries=Array.from(document.querySelectorAll('[data-gallery]'));
function showImage(group,index){const item=datasets[group]?.[index];if(!item)return;const img=get(group+'Image');img.hidden=false;const notice=img.closest('.image-area')?.querySelector('.image-unavailable');if(notice)notice.hidden=true;img.alt=item.alt;img.src=item.src;get(group+'Caption').textContent=item.caption;if(group==='fold')get('foldImageLink').href=item.src;if(group==='part')get('partTitle').textContent=item.title;galleries.filter(b=>b.dataset.gallery===group).forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index)));}
galleries.forEach(b=>b.addEventListener('click',()=>showImage(b.dataset.gallery,Number(b.dataset.index))));
for(const img of document.querySelectorAll('.image-area img')){function fail(){img.hidden=true;const notice=img.closest('.image-area')?.querySelector('.image-unavailable');if(notice)notice.hidden=false;}img.addEventListener('error',fail);if(img.complete&&!img.naturalWidth)fail();}
const contacts=[84,104,103,92,81,110,81,80],frames=Array.from(document.querySelectorAll('[data-frame]'));
frames.forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.frame);get('ensembleFrame').textContent='構造候補 '+(i+1)+' / 8';get('ensembleContacts').textContent=contacts[i]+' ペア';frames.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));
const phases=[['まず、何を作るのか。','標的や必要な性質を文献・公開構造から整理し、設計条件を定義します。'],['形の候補を生成する。','RFdiffusion系などのモデルで、設計条件に対応する骨格候補を生成します。'],['形を支える配列を考える。','ProteinMPNNやLigandMPNNなどで、骨格に対応するアミノ酸配列を設計します。'],['別のモデルで確かめる。','AlphaFold 3やBoltz-2などの構造予測結果を用い、設計意図との整合性を検討します。計算結果だけでは実際の結合や機能は証明できません。']];
const phaseButtons=Array.from(document.querySelectorAll('[data-phase-button]'));
phaseButtons.forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.phaseButton);get('phaseTitle').textContent=phases[i][0];get('phaseText').textContent=phases[i][1];phaseButtons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('.pipeline-graphic [data-phase]').forEach(g=>g.classList.toggle('is-selected',Number(g.dataset.phase)===i));}));
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');let ticking=false;
function move(){ticking=false;for(const e of document.querySelectorAll('.exhibit')){const rect=e.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight){e.style.setProperty('--exhibit-shift','0px');continue;}const offset=motion.matches?0:Math.max(-28,Math.min(28,(rect.top+rect.height/2-innerHeight/2)*.07));e.style.setProperty('--exhibit-shift',offset.toFixed(1)+'px');}}
function scheduleMove(){if(!ticking){ticking=true;requestAnimationFrame(move);}}window.addEventListener('scroll',scheduleMove,{passive:true});window.addEventListener('resize',scheduleMove,{passive:true});move();
})();
