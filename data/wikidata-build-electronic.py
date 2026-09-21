import csv,collections,re,sys,os
sys.setrecursionlimit(10000)
HERE=os.path.dirname(os.path.abspath(__file__))
def rd(f): return [x for x in list(csv.reader(open(os.path.join(HERE,f),encoding='utf-8')))[1:] if x]
q=lambda u:u.rsplit('/',1)[-1]
lab={};links={}
for g,l,k in rd('a_labels.csv'): lab[q(g)]=l; links[q(g)]=int(k or 0)
G=set(lab)
par=collections.defaultdict(set)
for g,p in rd('b_parents.csv'):
    if q(p) in G: par[q(g)].add(q(p))
yr={}
for g,y in rd('c_inception.csv'):
    if y.isdigit(): yr[q(g)]=min(int(y),yr.get(q(g),9999))
ctry=collections.defaultdict(set)
for g,c in rd('d_country.csv'): ctry[q(g)].add(c)
mbid={}
for g,m in rd('e_mb.csv'): mbid.setdefault(q(g),m)
M={g for g in G if g in mbid and lab[g]}
ROOT='Q9778'
def anc(g,seen=None):
    seen=set() if seen is None else seen
    for p in par[g]:
        if p not in seen: seen.add(p); anc(p,seen)
    return seen
A={g:anc(g) for g in G}
B={g for g in M if ROOT in A[g]}          # Electronic branch, MusicBrainz-recognised
geo=lambda p: lab[p].lower().startswith(('music of','music in'))
def nearest(g):
    """nearest ancestors inside the branch (climbing through non-recognised genres)"""
    out=set(); stack=list(par[g]); seen=set()
    while stack:
        p=stack.pop()
        if p in seen: continue
        seen.add(p)
        if p==ROOT or p in B: out.add(p)
        else: stack.extend(par[p])
    return out
words=lambda s:set(re.findall(r'[a-z0-9]+',s.lower()))-{'music','and','the','of'}
cand={}
for g in B:
    c={p for p in nearest(g) if not geo(p)}
    c={p for p in c if not any(p in A[o] for o in c if o!=p)}   # drop candidates that are ancestors of another candidate
    cand[g]=c or {ROOT}
depth_raw=lambda p: len(A[p]&(B|{ROOT}))
choice={};how={}
for g in B:
    c=cand[g]
    if len(c)==1: choice[g]=next(iter(c)); how[g]='single'
    else:
        best=max(c,key=lambda p:(len(words(lab[p])&words(lab[g])),depth_raw(p),links[p],p))
        choice[g]=best; how[g]='auto'
# known inversions in Wikidata
byname={lab[g].lower():g for g in sorted(B)}
OV={'jungle':['breakbeat hardcore','breakbeat','electronic dance music'],'drum and bass':['jungle']}
for child,plist in OV.items():
    if child in byname:
        for pn in plist:
            if pn in byname: choice[byname[child]]=byname[pn]; how[byname[child]]='override'; break
# cycle guard
def chain(g):
    seen=[g]
    while choice.get(seen[-1]) and choice[seen[-1]]!=ROOT:
        n=choice[seen[-1]]
        if n in seen: return None
        seen.append(n)
    return seen
bad=[lab[g] for g in B if chain(g) is None]; print('cycles:',bad)
kids=collections.defaultdict(list)
for g in B: kids[choice[g]].append(g)
def total(g): return sum(1+total(k) for k in kids[g])
level={g:len(chain(g)) for g in B}
rule=lambda n:'ring' if n<=12 else ('dial' if n<=40 else 'group')
rows=[]
def emit(g):
    for k in sorted(kids[g],key=lambda k:(yr.get(k,9999),lab[k].lower())):
        n=len(kids[k])
        rows.append(dict(wikidata_id=k,musicbrainz_id=mbid[k],name=lab[k],parent_wikidata_id=choice[k],parent_name=lab[choice[k]],level=level[k],
            children_direct=n,descendants_total=total(k),display_rule=rule(n),epoch_year=yr.get(k,''),origin=' · '.join(sorted(ctry.get(k,[]))),
            bpm_min='',bpm_max='',parent_choice=how[k],wikidata_parents_raw=' | '.join(sorted(lab[p] for p in par[k])),wikipedia_links=links[k]))
        emit(k)
rows.append(dict(wikidata_id=ROOT,musicbrainz_id=mbid.get(ROOT,''),name=lab[ROOT],parent_wikidata_id='',parent_name='',level=0,children_direct=len(kids[ROOT]),descendants_total=total(ROOT),display_rule=rule(len(kids[ROOT])),epoch_year=yr.get(ROOT,''),origin='',bpm_min='',bpm_max='',parent_choice='root',wikidata_parents_raw='',wikipedia_links=links[ROOT]))
emit(ROOT)
out=sys.argv[1] if len(sys.argv)>1 else os.path.join(HERE,'genre-electronic-import.csv')
w=csv.DictWriter(open(out,'w',newline='',encoding='utf-8'),fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
assert len(rows)==len(B)+1
print('rows',len(rows),'single',sum(1 for g in B if how[g]=='single'),'auto',sum(1 for g in B if how[g]=='auto'),'override',sum(1 for g in B if how[g]=='override'))
print('year',sum(1 for g in B if g in yr),'origin',sum(1 for g in B if g in ctry))
print('levels',sorted(collections.Counter(level.values()).items()))
print('dial:',[(lab[g],len(kids[g])) for g in list(B)+[ROOT] if 12<len(kids[g])<=40])
print('group:',[(lab[g],len(kids[g])) for g in list(B)+[ROOT] if len(kids[g])>40])
print('root kids:',[lab[k] for k in kids[ROOT]])
print('auto samples:',[(lab[g],'->',lab[choice[g]],'of',sorted(lab[p] for p in cand[g])) for g in sorted(B,key=lambda g:-links[g]) if how[g]=='auto'][:14])
