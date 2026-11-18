"""Render the three standalone audition kits. Run from this directory."""
from pathlib import Path
import ctypes as C
import json
import os
import subprocess
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io.wavfile import write

SR = 32000
ROOT = Path(__file__).resolve().parent
FONT = os.environ.get('SOUNDFONT', '/usr/share/sounds/sf2/TimGM6mb.sf2')
lib = C.CDLL('libfluidsynth.so.3')
P, I, D, S = C.c_void_p, C.c_int, C.c_double, C.c_char_p

def bind(name, result, *args):
    f = getattr(lib, name)
    f.restype, f.argtypes = result, args
    return f

settings = bind('new_fluid_settings', P)()
bind('fluid_settings_setnum', I, P, S, D)(settings, b'synth.sample-rate', SR)
synth = bind('new_fluid_synth', P, P)(settings)
sf = bind('fluid_synth_sfload', I, P, S, I)(synth, FONT.encode(), 1)
if sf < 0:
    raise RuntimeError('Cannot load soundfont')
program = bind('fluid_synth_program_select', I, P, I, I, I, I)
cc = bind('fluid_synth_cc', I, P, I, I, I)
on = bind('fluid_synth_noteon', I, P, I, I, I)
off = bind('fluid_synth_noteoff', I, P, I, I)
render = bind('fluid_synth_write_float', I, P, I, P, I, I, P, I, I)
silence = bind('fluid_synth_all_sounds_off', I, P, I)

# Each row is a phrase, given as (onset in beats, scale degree, duration).
# The descending answer and the held final notes leave space for text.
themes = [
    [[(0,4,1.65),(2,5,.7)],[(0,2,2.4)],[(.5,1,.85),(1.5,0,1.3)],[(0,-1,1.5)]],
    [[(.5,2,.8),(1.5,3,.32),(2,4,.9)],[(0,2,1.3),(2,1,.8)],[(0,0,.8),(1,1,.35),(1.5,2,1.2)],[(.5,-1,1.9)]],
    [[(1,0,.6),(2,1,1.6)],[(0,4,2.1)],[(.5,3,.55),(2,1,1.45)],[(1,0,2.3)]]]
kits = [
    ('A','灯下的名册',[0,42,71,48], [0,2,3,5,7,8,10],62,3,68),
    ('B','江岸来信',[24,73,45,41], [0,2,4,7,9],55,3,82),
    ('C','墙内的回声',[11,70,43,45], [0,1,3,5,7,8,10],57,5,79)]
scenes = [('archive','翻开名册'),('street','街巷寻人'),('bridge','桥头倒计时'),('warehouse','仓内守夜'),('coda','余声')]
effects = dict(type='落字',click='操作',save='归档',radio='电台',alert='警示',damage='受击',explosion='远处爆响',success='阶段完成')

def level(x, rms, cap):
    return x * min(rms / max(1e-7,float(np.sqrt(np.mean(x*x)))),cap/max(1e-7,float(np.max(abs(x)))))

def music(k, scene):
    _,_,voices,scale,tonic,meter,bpm = kits[k]
    rng = np.random.default_rng(1937+100*k+scene)
    beat = 60/(bpm+[0,6,14,-5,-10][scene])
    bars = [12,12,16,12,8][scene]
    length = round(SR*bars*meter*beat)
    for ch, voice in enumerate(voices):
        silence(synth,ch)
        program(synth,ch,sf,0,voice)
        for ctrl,val in [(10,[53,72,61,78][ch]),(91,[32,46,29][k]),(93,0),(7,[99,87,89,65][ch])]:
            cc(synth,ch,ctrl,val)
    def pitch(d):
        octv, idx = divmod(d,len(scale))
        return tonic + 12*octv + scale[idx]
    events = []
    def note(ch, at, key, dur, vel):
        start=max(0,round((at*beat+rng.uniform(-.012,.012))*SR))
        end=start+round(dur*beat*SR)
        events.extend([(start,1,ch,key,int(np.clip(vel+rng.integers(-4,5),1,115))), (end,0,ch,key,0)])
    roots = [[0,-3,-1,-4,0,2,-3,-1], [0,-2,1,-3,0,2,1,-1], [0,0,-1,0,-3,-1,1,-1],
             [0,-3,-3,-1,2,-3,0,-1], [0,-3,2,-1,-3,-1,0,0]][scene]
    for b in range(bars):
        pos, root = b*meter, roots[b%8]
        last = scene==4 and b>=bars-2
        phrase = themes[k][(b+[0,2,1,3,0][scene])%4]
        lead = [0,1,1,1,0][scene] if k!=2 else [1,0,1,1,0][scene]
        if not last and (b%4!=3 or scene!=3):
            for at,d,dur in phrase:
                response = (1 if k==1 else -2) if 4<=b%12<8 else 0
                note(lead,pos+at,pitch(d+response)+(12 if k==1 else 0),dur,58+5*(b%4==2))
        if last and b==bars-2:
            note(lead,pos,pitch(0)+(12 if k==1 else 0),meter*1.35,47)
        note(2,pos+.045,pitch(root)-12,meter*(.48 if k==1 else .83),54 if not last else 42)
        harmony = [pitch(root),pitch(root+2),pitch(root+4)]
        accomp = 0 if lead==1 else 3
        if not last:
            pattern = [[(.12,0),(1.13,2),(2.1,1)],[(0,0),(.55,2),(1.52,1),(2.53,2)],[(0,0),(2.62,1),(4,2)]][k]
            for j,(at,idx) in enumerate(pattern):
                if (scene==3 and j%2) or (scene==0 and b%4==3 and j): continue
                note(accomp,pos+at,harmony[idx],.58 if k==1 else 1.02,41+6*(j==0))
            if scene==2:
                for at in ([1.52,2.52] if k<2 else [1.5,3.45,4.45]):
                    note(2,pos+at,pitch(root)-5,.27,53)
            if b%4==3 and scene in [0,1,3]:
                note(1 if lead==0 else 3,pos+meter*.45,pitch(root+4),meter*.45,44)
    # Two passes carry release tails across the loop boundary.
    looping = scene!=4
    if looping:
        events += [(t+length,f,c,n,v) for t,f,c,n,v in events]
    total = length*(2 if looping else 1) + (0 if looping else SR*2)
    buf = np.zeros((total,2),np.float32)
    cur=0
    for t,f,ch,n,v in sorted(events)+[(total,0,0,0,0)]:
        t=min(total,t)
        if t>cur:
            ptr=buf[cur:].ctypes.data
            render(synth,t-cur,ptr,0,2,ptr,1,2)
            cur=t
        if f: on(synth,ch,n,v)
        else: off(synth,ch,n)
    x=buf[length:].copy() if looping else buf
    if looping:
        # Match the end of pass two to the actual lead-in of pass two.
        size=round(.10*SR)
        fade=np.linspace(0,1,size)[:,None]
        x[-size:]=x[-size:]*(1-fade)+buf[length-size:length]*fade
    else: x[-SR:]*=np.linspace(1,0,SR)[:,None]
    return level(x,.080,.76)

def effect(k,kind,v):
    rng=np.random.default_rng(1000*k+40*list(effects).index(kind)+v)
    d={'type':.12,'click':.18,'save':.65,'radio':.93,'alert':.84,'damage':.88,'explosion':2.25,'success':1.45}[kind]
    x=np.zeros(int(SR*d))
    # Three foley palettes: wood/paper, bamboo/cloth, metal/masonry.
    material=[(.97,.075),(1.28,.045),(.79,.14)][k]
    def strike(at,amp,hz,decay,band):
        i=int(at*SR)
        t=np.arange(len(x)-i)/SR
        if not len(t): return
        hz*=material[0]*rng.uniform(.94,1.06)
        env=(1-np.exp(-t/.0013))*np.exp(-t/decay)
        modes=sum(a*np.sin(2*np.pi*hz*r*t)*np.exp(-t/(decay*(1.8/r))) for r,a in [(1,.62),(1.53,.35),(2.72,.23),(4.19,.13)])
        noise=sosfilt(butter(2,band,fs=SR,btype='bandpass',output='sos'),rng.normal(size=len(t)))
        x[i:]+=amp*env*(modes+noise*1.75)
    def rustle(at,dur,amp,band):
        i=int(at*SR); n=min(int(dur*SR),len(x)-i)
        u=np.linspace(0,1,n)
        y=sosfilt(butter(2,band,fs=SR,btype='bandpass',output='sos'),rng.normal(size=n))
        flex=np.interp(u,np.linspace(0,1,12),rng.uniform(.1,1,12))
        x[i:i+n]+=amp*y*np.sin(np.pi*u)**1.5*flex
    if kind in ['type','click','save']:
        strike(.004,.7,470 if kind=='type' else 330,.018 if kind=='type' else .033,[600,4100])
        if kind=='save':
            rustle(.03,.34,.9,[550,4550]);strike(.38,1,205,.058,[230,1800])
        if kind=='click': strike(.045,.27,710,.013,[900,4200])
    if kind=='radio':
        strike(.006,.65,680,.016,[700,3100]);rustle(.04,.69,1,[510,2700]);strike(.78,.65,530,.025,[630,3250])
    if kind in ['alert','success']:
        pitches = ([69,68],[67,69],[64,65])[k] if kind=='alert' else ([62,65,69],[67,69,74],[57,60,64])[k]
        for j,n in enumerate(pitches):
            strike(.01+j*(.27 if kind=='alert' else .31),1-j*.11,440*2**((n-69)/12),material[1]+.11,[600,2200])
    if kind=='damage':
        rustle(.001,.12,.7,[550,4300])
        strike(.025,1.1,137-12*v,.083+.021*v,[130,1400])
        strike(.076,.48,295,.042,[300,1950])
        if v: rustle(.12,.16+v*.06,.62,[220,1750])
        if v==2: strike(.21,.42,192,.075,[260,1600])
    if kind=='explosion':
        strike(.009,1,68,.19,[85,1000]);strike(.085,.42,127,.15,[110,930])
        rustle(.05,1.37,1.25,[75,550])
        for j in range(4): strike(.27+j*.14+rng.uniform(0,.1),.19/(1+j*.28),265,.045,[450,1900])
    out=np.stack([x,x.copy()],axis=1)
    for ch,ms in enumerate(([21,34],[34,48],[47,61])[k]):
        delay=int(SR*ms/1000)
        out[delay:,ch]+=x[:-delay]*(.07 if kind=='type' else .15)
    out[-min(len(x),320):]*=np.linspace(1,0,min(len(x),320))[:,None]
    peak=dict(type=.075,click=.16,save=.27,radio=.29,alert=.36,damage=[.39,.57,.78][v],explosion=.73,success=.33)[kind]
    return (out*peak/np.max(abs(out))).astype(np.float32)

def encode(path,x):
    pcm=np.round(np.clip(x,-1,1)*32767).astype('<i2')
    if path.suffix=='.wav': write(path,SR,pcm); return
    subprocess.run(['ffmpeg','-loglevel','error','-y','-f','s16le','-ar',str(SR),'-ac','2','-i','pipe:0','-q:a','4',str(path)],input=pcm.tobytes(),check=True)

for k,(letter,title,*_) in enumerate(kits):
    folder=ROOT/letter
    folder.mkdir(exist_ok=True)
    tracks=[]
    for s,(name,_) in enumerate(scenes):
        x=music(k,s)
        encode(folder/(name+'.ogg'),x)
        tracks.append(x)
    sounds={}
    for kind in effects:
        for v in range(3):
            sounds[kind,v]=effect(k,kind,v)
            encode(folder/f'{kind}-{v+1}.wav',sounds[kind,v])
    # Identical scene timing and FX order for comparison across kits.
    mix=np.zeros((36*SR,2),np.float32)
    for s,(begin,end) in enumerate([(0,8),(7,15),(14,24),(23,30),(29,36)]):
        dur=(end-begin)*SR
        excerpt=(tracks[s][-dur:] if s==4 else tracks[s][:dur]).copy()
        excerpt[:SR]*=np.linspace(0,1,SR)[:,None]
        excerpt[-SR:]*=np.linspace(1,0,SR)[:,None]
        mix[begin*SR:end*SR]+=excerpt*.81
    for sec,kind,v in [(1,'save',0),(8,'type',1),(8.22,'type',0),(10,'radio',1),(15,'alert',0),(18,'explosion',1),(20.8,'damage',0),(22,'damage',2),(25,'click',1),(30,'success',0)]:
        start=round(sec*SR); fx=sounds[kind,v]
        mix[start:start+len(fx)]+=fx
    encode(folder/'demo.mp3',mix)
    print('Rendered',title,flush=True)
