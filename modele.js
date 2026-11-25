/* ===== ESTIMATION AUTOMATIQUE =====
 Modèle maison : des hypothèses réglées à la main (ce ne sont PAS des mesures). Il donne un ordre de grandeur
 à partir de l'heure, du jour, du calendrier et de ce qu'il y a autour du resto. Les infos des gens le corrigent. */
const ZONE={};for(const [z,l] of [['A','25 39 70 90 24 33 40 47 64 03 15 43 63 21 58 71 89 07 26 38 73 74 19 23 87 01 42 69 16 17 79 86'],['B','04 05 13 84 02 60 80 59 62 54 55 57 88 44 49 53 72 85 06 83 14 27 50 61 76 18 28 36 37 41 45 08 10 51 52 22 29 35 56 67 68'],['C','77 93 94 11 30 34 48 66 75 09 12 31 32 46 65 81 82 78 91 92 95']])for(const d of l.split(' '))ZONE[d]=z;
/* Vacances scolaires 2026-2027 (arrêté du 22/10/2025, source service-public.gouv.fr). Début = samedi après la classe,
   fin = lundi de reprise (exclu). Corse et outre-mer ont leur propre calendrier : non gérés. Fin de l'été 2027 supposée au 1er septembre. */
let HOL=[['2026-10-17','2026-11-02',['A','B','C'],'Vacances de la Toussaint'],['2026-12-19','2027-01-04',['A','B','C'],'Vacances de Noël'],
 ['2027-02-13','2027-03-01',['A'],'Vacances d\'hiver'],['2027-02-20','2027-03-08',['B'],'Vacances d\'hiver'],['2027-02-06','2027-02-22',['C'],'Vacances d\'hiver'],
 ['2027-04-10','2027-04-26',['A'],'Vacances de printemps'],['2027-04-17','2027-05-03',['B'],'Vacances de printemps'],['2027-04-03','2027-04-19',['C'],'Vacances de printemps'],
 ['2027-07-03','2027-09-01',['A','B','C'],'Vacances d\'été']];
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const holOf=(k,z)=>z?HOL.find(h=>h[2].includes(z)&&k>=h[0]&&k<h[1]):null;
const FER={};
function feries(y){if(FER[y])return FER[y];const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=(h+l-7*m+114)%31+1;
 const add=n=>ymd(new Date(y,mo-1,da+n));   /* Pâques + n jours : lundi de Pâques, Ascension, lundi de Pentecôte */
 return FER[y]=new Set([`${y}-01-01`,add(1),`${y}-05-01`,`${y}-05-08`,add(39),add(50),`${y}-07-14`,`${y}-08-15`,`${y}-11-01`,`${y}-11-11`,`${y}-12-25`])}
/* calendrier officiel mis à jour automatiquement (data/calendrier.json) : remplace les dates écrites ci-dessus */
function setCalendar(c){if(!c)return;if(Array.isArray(c.vacances)&&c.vacances.length){HOL=c.vacances;if(HOL.some(h=>h[2].includes('Corse')))ZONE['2A']=ZONE['2B']='Corse'}
 for(const y in c.feries||{})FER[y]=new Set(c.feries[y]);CTX.clear()}
const isFer=d=>feries(d.getFullYear()).has(ymd(d));
const CTX=new Map();
function ctx(d,z){const key=ymd(d)+(z||'');let c=CTX.get(key);if(c)return c;
 const dow=d.getDay(),fer=isFer(d),tom=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1),hol=holOf(ymd(d),z),mo=d.getMonth()+1,dm=d.getDate();
 c={dow,fer,eff:fer?0:dow,hol,veille:isFer(tom),preHol:!hol&&!!holOf(ymd(tom),z),mo,dm,
  school:!fer&&dow>=1&&dow<=5&&!hol&&ymd(d)!=='2027-05-07',summer:mo===7||mo===8,xmas:mo===12&&dm<=24,quiet:(mo===12&&dm===25)||(mo===1&&dm===1)};
 if(CTX.size>600)CTX.clear();CTX.set(key,c);return c}
/* poids des 5 moments de la journée, de dimanche à samedi : midi, après-midi, soir, nuit, matin */
const WK=[[.72,.42,.88,.14,.08],[.62,.22,.55,.10,.12],[.62,.22,.55,.10,.12],[.72,.38,.60,.10,.12],[.64,.24,.60,.14,.12],[.70,.30,.85,.30,.12],[.85,.55,.95,.38,.10]];
const G=(t,m,s)=>Math.exp(-((t-m)**2)/(2*s*s));
const slot=d=>{let t=d.getHours()+d.getMinutes()/60,day=d;if(t<5){t+=24;day=new Date(d.getFullYear(),d.getMonth(),d.getDate()-1)}return[t,day]};
/* remplissage estimé entre 0 (vide) et 1.1 (débordé). r.f = [école, campus, gare, commerces, sorties, tourisme, bureaux, sport, autoroute, densité, fast-foods voisins] */
function auto(r,d){const [t,day]=slot(d),c=ctx(day,r.z),[sch,uni,sta,shop,night,tour,work,,hw,dens,nff]=r.f;
 let [L,A,D,N,M]=WK[c.eff],fl=.05,ex=0,all=1;const wd=c.eff>=1&&c.eff<=5;
 if(c.school){L*=1+.22*sch;A*=1+.5*sch;if(c.dow===3)A*=1+.3*sch}                       /* sortie des cours, mercredi après-midi */
 if(wd&&!c.summer){L*=1+.18*uni;D*=1+.1*uni;N*=1+(c.dow===4?.6:.3)*uni}                 /* étudiants, jeudi soir */
 if(wd){M*=1+1.5*sta;ex+=.3*sta*G(t,18,1)}                                             /* trains du matin et du soir */
 if(c.dow===5||c.eff===0)D*=1+.25*sta;fl+=.07*sta;
 if(c.eff===6){A*=1+.7*shop;L*=1+.25*shop}else if(c.eff===0)all*=1-.25*shop;else{L*=1+.1*shop;if(c.dow===3)A*=1+.3*shop}   /* samedi shopping, galeries fermées le dimanche */
 if(c.xmas&&c.eff!==0){A*=1+.35*shop;L*=1+.15*shop}                                    /* courses de Noël */
 if(c.hol&&wd){A*=1.3+.25*shop;L*=1.08}                                                /* enfants à la maison */
 if(c.dow===5||c.dow===6||c.veille){N*=1+night;D*=1+.15*night}                         /* sorties du week-end */
 if(c.veille&&c.dow!==5&&c.dow!==6){D*=1.15;N*=1.5}
 if(!wd||c.hol){L*=1+.3*tour;A*=1+.3*tour}
 if(c.summer)all*=1+.2*tour+.25*hw;
 if(wd){L*=1+.22*work;if(c.mo===8)L*=1-.15*work}else L*=1-.15*work;                     /* pause déjeuner des bureaux */
 fl+=.1*hw;if(c.hol&&c.dow===6)all*=1+.5*hw;if(c.preHol&&c.dow===5)D*=1+.4*hw;if(c.dow===5||c.eff===0)D*=1+.2*hw;   /* départs et retours */
 if(r.dr){D*=1.08;N*=1.15}
 if(c.quiet)all*=.6;                                                                   /* 25 décembre, 1er janvier */
 L=Math.min(L,WK[c.eff][0]*1.45);D=Math.min(D,WK[c.eff][2]*1.45);                           /* les bonus ne s'empilent pas sans limite */
 const base=L*G(t,12.6,.75)+A*G(t,16.4,1.1)+D*G(t,19.8,1)+N*G(t,23.3,1.3)+M*G(t,8.5,1)+ex+fl;
 return Math.max(0,Math.min(1.1,base*all*(.66+.2*dens+.05*Math.min(1,nff/15))))}
const lvOf=b=>b<.42?1:b<.82?2:3;
const JOURS=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
function why(r,d){const [t,day]=slot(d),c=ctx(day,r.z),o=[];
 o.push(t<10.5?'Matin':t<11.5?'Avant le rush de midi':t<14?'Rush du déjeuner':t<15.5?'Après le déjeuner':t<18?'Après-midi':t<18.75?'Avant le rush du soir':t<21.5?'Rush du dîner':'Fin de soirée');
 o.push(c.fer?'Jour férié':JOURS[c.dow]);
 if(c.hol)o.push(c.hol[3]+(c.hol[2].length===1&&r.z.length===1?` (zone ${r.z})`:''));
 if(c.veille)o.push('Veille de jour férié');
 if(c.xmas&&r.f[3]>.5)o.push('Courses de Noël');
 return o}
function profile(r){const [sch,uni,sta,shop,night,tour,work,,hw]=r.f,o=[];
 if(sta>.5)o.push('Gare à côté');if(shop>.5)o.push('Zone commerciale');if(uni>.5)o.push('Campus à côté');if(sch>.5)o.push('École à côté');
 if(work>.5)o.push('Bureaux');if(night>.4)o.push('Quartier de sorties');if(tour>.5)o.push('Zone touristique');if(hw>.5)o.push('Bord d\'autoroute');return o}
/* ===== infos des gens : valeurs partagées entre le site et l'apprentissage automatique ===== */
const BL=[0,.18,.56,.92];   /* niveau signalé (1 calme, 2 du monde, 3 blindé) -> remplissage */
const PB=[null,['moins de 10',5],['10 à 25',17],['25 à 50',37],['50 à 80',65],['plus de 80',95]];
/* personnes devant soi dans la file : 0 à 2, 3 à 6, 7 à 12, 13 ou plus */
const BQ=[0,.15,.45,.75,1];
/* attente chronométrée en minutes -> remplissage (5 min = début de « du monde », 15 min = début de « blindé ») */
const bWait=w=>w<=5?.1+.32*w/5:w<=15?.42+.4*(w-5)/10:Math.min(1.05,.82+.23*(w-15)/10);
const lvWait=w=>w<5?1:w<15?2:3;
/* temps pour avoir sa commande, donné après coup : moins de 3, 3 à 6, 6 à 10, 10 à 15, plus de 15 min (milieu de chaque tranche) */
const DMID=[0,2,4.5,8,12.5,18];
/* valeur d'une info, de la plus précise à la moins précise : attente chronométrée, sinon niveau + file, sinon niveau seul.
   Les détails ajustent : service lent, peu de personnel, bornes prises ou gros groupe = plus d'attente */
const bRep=x=>{if(x.w>0)return bWait(x.w);let b=x.q>0?(BL[x.l]+BQ[x.q])/2:BL[x.l];const t=x.tg||[];b+=.07*t.filter(k=>k==='le'||k==='pe'||k==='bo'||k==='gr').length;if(t.includes('pl'))b=Math.max(b,.8);if(x.d>0&&DMID[x.d])b=(b+bWait(DMID[x.d]))/2;return Math.min(1.05,b)};
/* poids d'une info : confirmée sur place, position inconnue, ou donnée de loin ; une attente chronométrée compte 1,5 fois plus */
const wG=x=>(x.g===1?1.3:x.g===-1?.5:1)*(x.w>0?1.5:1);
/* ===== points et classement (partagés entre le site et la mise à jour automatique) ===== */
/* une info rapporte 10 points ; +5 si elle est donnée sur place, +15 pour une attente chronométrée, +5 pour un comptage photo,
   +2 pour la file, +2 pour un détail. Une info donnée de loin ne rapporte que 2 points. */
const ptsOf=x=>x.g===-1?2:10+(x.g===1?5:0)+(x.w>0?15:0)+(x.c>0?5:0)+(x.q>0?2:0)+((x.tg||[]).length?2:0)+(x.d>0&&!(x.w>0)?5:0);
const NIVEAUX=[[0,'Nouveau'],[50,'Habitué'],[200,'Éclaireur'],[500,'Expert de la file'],[1500,'Légende']];
/* pseudo automatique tiré de l'identifiant anonyme : personne ne choisit de nom, donc rien à modérer */
const PSA=['Frite','Nugget','Cornichon','Sésame','Ketchup','Moutarde','Milkshake','Bun','Sundae','Pilon','Wrap','Oignon'],PSB=['pressé','malin','rapide','zen','futé','affamé','discret','vif','matinal','nocturne','patient','chanceux'];
const pseudo=h=>`${PSA[parseInt(h.slice(0,2),16)%12]} ${PSB[parseInt(h.slice(2,4),16)%12]} ${parseInt(h.slice(4,6),16)%100}`;
