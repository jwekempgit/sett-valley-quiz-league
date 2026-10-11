# Turns a week's question PDF into public/questions/<date>.json.
# Usage: python3 scripts/questions-from-pdf.py bullets|table file.pdf 2026-10-01 public/questions/2026-10-01.json
# "bullets": numbered questions with the answer in bold; "table": number | question | answer columns. Check the output by eye.
import pymupdf,sys,json,re
def clean(s): return re.sub(r'\s+',' ',s).strip()
def lines(path):
  d=pymupdf.open(path)
  for pn,p in enumerate(d):
    for b in p.get_text('dict')['blocks']:
      for l in b.get('lines',[]):
        yield pn,l['bbox'][0],l['bbox'][1],[(s['text'],bool(s['flags']&16 or 'Bold' in s['font'])) for s in l['spans']]

def bullets(path):  # week 1 style: "N. question? **answer**", Spares with bullets
  halves=[];cur=None;item=None;spares=False
  for pn,x,y,spans in lines(path):
    text=''.join(t for t,_ in spans)
    if re.search(r'(first|second) half',text,re.I):
      cur={'title':'First half' if 'first' in text.lower() else 'Second half','questions':[],'spares':[]};halves.append(cur);spares=False;item=None;continue
    if clean(text)=='Spares': spares=True;item=None;continue
    if not clean(text): continue
    m=re.match(r'\s*(\d+)\.\s*',text)
    if not spares and m and x<50:
      item={'n':int(m.group(1)),'q':'','a':''};cur['questions'].append(item)
      # drop the number from the spans
      rest=len(m.group(0));new=[]
      for t,bd in spans:
        if rest>=len(t): rest-=len(t);continue
        new.append((t[rest:],bd));rest=0
      spans=new
    elif spares and clean(text)=='•':
      item={'q':'','a':''};cur['spares'].append(item);continue
    for t,bd in spans:
      if bd and t.strip(): item['a']+=t
      elif item['a'] and not t.strip(): item['a']+=t
      else: item['q']+=t
    for k in ('q','a'): item[k]=item[k] if item[k].endswith(' ') or not item[k] else item[k]+' '
  for h in halves:
    for it in h['questions']+h['spares']: it['q'],it['a']=clean(it['q']),clean(it['a'])
  return {'halves':halves,'spares':[]}

def table(path):  # week 2 style: number | question | answer columns
  rows={};order=[];spares=False;sp=[]
  L=list(lines(path))
  heads=[]
  for pn,x,y,spans in L:
    t=clean(''.join(s for s,_ in spans))
    if t=='Spares': spares_at=(pn,y)
  for pn,x,y,spans in L:
    t=clean(''.join(s for s,_ in spans))
    if x<50 and re.fullmatch(r'\d+',t):
      key=(pn,y); is_sp=(pn,y)>spares_at
      rows[key]={'n':int(t),'q':'','a':'','sp':is_sp};order.append(key)
  for pn,x,y,spans in L:
    t=clean(''.join(s for s,_ in spans))
    if not t or x<50 or x>540: continue
    cands=[k for k in order if k[0]==pn and abs(k[1]-y)<20]
    if not cands: continue
    k=min(cands,key=lambda k:abs(k[1]-y))
    col='q' if x<395 else 'a'
    rows[k][col]=clean(rows[k][col]+' '+t)
  qs=[rows[k] for k in order if not rows[k]['sp']]; sp=[rows[k] for k in order if rows[k]['sp']]
  strip=lambda r:{'n':r['n'],'q':r['q'],'a':r['a']}
  return {'halves':[{'title':'First half','questions':[strip(r) for r in qs if r['n']<=30],'spares':[]},
                    {'title':'Second half','questions':[strip(r) for r in qs if r['n']>30],'spares':[]}],
          'spares':[{'q':r['q'],'a':r['a']} for r in sp]}

kind,src,date,out=sys.argv[1:]
data=(bullets if kind=='bullets' else table)(src); data={'date':date,**data}
json.dump(data,open(out,'w'),indent=1,ensure_ascii=False)
for h in data['halves']: print(h['title'],len(h['questions']),[q['n'] for q in h['questions']][:3],'spares',len(h['spares']))
print('overall spares',len(data['spares']))
