"""Build three offline UI studies and a conversation preview from one shared source."""
import argparse,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--artifacts',type=pathlib.Path,default=ROOT/'test-artifacts/ui-concepts');args=parser.parse_args()
SOURCE=ROOT/'design/ui-concepts';OUTPUT=ROOT/'public/ui-concepts';ARTIFACTS=args.artifacts
OUTPUT.mkdir(parents=True,exist_ok=True);ARTIFACTS.mkdir(parents=True,exist_ok=True)
css=(SOURCE/'concepts.css').read_text(encoding='utf-8');js=(SOURCE/'concepts.js').read_text(encoding='utf-8');fixture=(SOURCE/'fixture.json').read_text(encoding='utf-8').replace('<','\\u003c')
fragment=(SOURCE/'inline-shell.html').read_text(encoding='utf-8').replace('__CONCEPT_CSS__',css).replace('__FIXTURE_JSON__',fixture).replace('__CONCEPT_JS__',js)
(ARTIFACTS/'lone-army-three-directions.html').write_text(fragment,encoding='utf-8')
shell=(SOURCE/'page-shell.html').read_text(encoding='utf-8')
standalone=fragment.replace('class="inline-preview"','class="standalone-preview"').replace('class="viz-carousel viz-dotted-background"','class="studio-stages"')
for filename,default in [('index.html','night'),('night-archive.html','night'),('field-command.html','command'),('paper-dispatch.html','paper')]:
    page=shell.replace('__CONCEPT_FRAGMENT__',standalone).replace('__DEFAULT_DESIGN__',default)
    # This setup precedes the shared renderer and is used only for baseline comparisons.
    setup="<script>const earlyParams=new URLSearchParams(location.search);const earlyRoot=document.getElementById('lone-army-ui-options');earlyRoot.dataset.sample=earlyParams.get('sample')==='opening'?'opening':'field';earlyRoot.dataset.screen=earlyParams.get('screen')==='menu'?'menu':'game';</script>"
    page=page.replace('<script>\n'+js,' '+setup+'<script>\n'+js)
    (OUTPUT/filename).write_text(page,encoding='utf-8');(ARTIFACTS/filename).write_text(page,encoding='utf-8')
print(json.dumps({'standalone_files':4,'concepts':3,'fixture_chapters':3,'inline_bytes':len(fragment.encode()),'artifact_directory':str(ARTIFACTS)},ensure_ascii=False))
