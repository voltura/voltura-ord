"""Reproducible SALDO morphology filter. Download source separately into work/."""
import hashlib, json, pathlib, re, sys, xml.etree.ElementTree as ET
source = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'work/saldom.xml')
out = pathlib.Path('data'); out.mkdir(exist_ok=True)
allowed = {'ab','al','av','in','kn','nl','nn','pn','pp','sn','vb'}
words=set(); entries=0
def feats(element):
    return {f.get('att'): f.get('val','') for f in element.findall('feat')}
for event, entry in ET.iterparse(source, events=('end',)):
    if entry.tag!='LexicalEntry': continue
    reps = entry.findall('Lemma/FormRepresentation')
    if any(feats(rep).get('partOfSpeech') in allowed for rep in reps):
        entries+=1
        for form in entry.findall('WordForm'):
            f=feats(form); word=f.get('writtenForm',''); msd=f.get('msd','')
            # Compound stems are marked c/ci/cm (or hyphenated variants).
            if re.search(r'(^|\s)(c|ci|cm|sms|compound)(\s|$)',msd): continue
            if re.fullmatch('[a-zåäö]{2,15}',word): words.add(word.upper())
    entry.clear()
ordered=sorted(words)
encoded=json.dumps(ordered,ensure_ascii=False,separators=(',',':')).encode('utf-8')
digest=hashlib.sha256(encoded).hexdigest()
groups={}
for word in ordered: groups.setdefault(word[:2],[]).append(word)
(out/'words.json').write_text(json.dumps({k:'\n'+'\n'.join(v)+'\n' for k,v in groups.items()},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
metadata={'version':'saldom-2017-09-19-v1-'+digest[:12], 'words':len(words), 'entries':entries,
 'source':'https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/saldom/saldom.xml',
 'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(), 'sha256':digest,
 'license':'CC-BY-4.0', 'attribution':'Språkbanken (2017). SALDOs morfologi. Göteborgs universitet. https://doi.org/10.23695/agcm-ny22',
 'changes':'Fullständiga gemena ordformer, 2–15 bokstäver A–Z/ÅÄÖ. Egennamn, förkortningar, flerordsuttryck och sammansättningsled uteslutna. Konverterade till versaler och deduplicerade.'}
(out/'dictionary.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for word in ['BOK','BOKEN','BÖCKER','BÖCKERNA']:
    assert word in words, word
assert 'STOCKHOLM' not in words
print(json.dumps(metadata,ensure_ascii=False))
