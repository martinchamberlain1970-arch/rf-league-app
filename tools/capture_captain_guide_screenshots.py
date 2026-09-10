from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "public/guides/screenshots"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)

def rounded(draw, box, fill, outline="#cbd5e1", radius=15, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def text(draw, xy, value, size=18, fill="#0f172a", bold=False):
    draw.text(xy, value, font=font(size, bold), fill=fill)

def selector(draw, x, y, w, value, muted=False):
    rounded(draw, (x, y, x+w, y+48), "#f8fafc" if muted else "white")
    text(draw, (x+14, y+13), value, 17, "#94a3b8" if muted else "#0f172a")
    draw.line((x+w-28, y+20, x+w-22, y+26, x+w-16, y+20), fill="#475569", width=2)

def wrap(draw, xy, value, max_width, size=17, fill="#475569"):
    words=value.split(); lines=[]; current=""
    for word in words:
        trial=(current+" "+word).strip()
        if draw.textlength(trial,font=font(size)) <= max_width: current=trial
        else: lines.append(current); current=word
    if current: lines.append(current)
    for i,line in enumerate(lines): text(draw,(xy[0],xy[1]+i*(size+6)),line,size,fill)

def make(mode, filename):
    im=Image.new("RGB",(1220,1450),"#f1f5f9"); d=ImageDraw.Draw(im)
    rounded(d,(24,24,1196,1426),"white","#cbd5e1",24)
    text(d,(55,52),"TRAINING MODE · WINTER LEAGUE",15,"#0f766e",True)
    text(d,(55,80),"Captain lineup journey",31,bold=True)
    text(d,(55,123),"Training Home vs Training Away · safe practice example",18,"#475569")

    proxy=mode=="proxy"
    rounded(d,(55,165,1165,285),"#f5f3ff","#c4b5fd")
    text(d,(78,187),"Agreed proxy entry",20,"#4c1d95",True)
    wrap(d,(78,220),"If both teams agree, this unlocks the opponent's player fields so one captain or vice-captain can enter both lineups.",760,17,"#5b21b6")
    rounded(d,(900,198,1135,252),"white","#a78bfa",12)
    text(d,(922,215),"Proxy entry active" if proxy else "Use agreed proxy entry",16,"#5b21b6",True)

    labels=[("four","Four players"),("three","Three players"),("two","Two players")]
    x=55
    for key,label in labels:
        active=mode==key or (proxy and key=="four")
        rounded(d,(x,310,x+165,354),"#0369a1" if active else "white","#0369a1" if active else "#cbd5e1",10)
        text(d,(x+22,323),label,15,"white" if active else "#334155",True);x+=178

    players=["Alex Carter (0)","Ben Morris (+8)","Chris Taylor (-4)","Daniel White (+16)"]
    away=["Jamie Smith (+4)","Lee Harris (0)","Morgan Jones (+12)","Pat Brown (-4)"]
    if mode=="two": vals=[players[0],players[1],"No Show","Alex Carter (nominated player)"]
    elif mode=="three": vals=[players[0],players[1],players[2],"Ben Morris (nominated player)"]
    else: vals=players
    top=380
    for i in range(4):
        col=i%2; row=i//2; x=55+col*555; y=top+row*250
        rounded(d,(x,y,x+530,y+228),"#f0f9ff","#7dd3fc")
        text(d,(x+18,y+18),f"Frame {i+1} · Singles",20,bold=True)
        text(d,(x+18,y+57),"TRAINING HOME",13,"#64748b",True); selector(d,x+18,y+78,494,vals[i])
        text(d,(x+18,y+137),"TRAINING AWAY",13,"#64748b",True); selector(d,x+18,y+158,494,away[i] if proxy else "Away player",not proxy)

    y=895
    rounded(d,(55,y,1165,y+235),"#f0f9ff","#7dd3fc")
    text(d,(73,y+18),"Frame 5 · Doubles",20,bold=True)
    text(d,(73,y+57),"TRAINING HOME",13,"#64748b",True)
    if mode=="three": pair=["Choose from Frames 1–3","Choose from Frames 1–3"]
    else: pair=players[:2]
    selector(d,73,y+78,520,pair[0]); selector(d,610,y+78,537,pair[1])
    text(d,(73,y+137),"TRAINING AWAY",13,"#64748b",True)
    selector(d,73,y+158,520,away[0] if proxy else "Away player 1",not proxy); selector(d,610,y+158,537,away[1] if proxy else "Away player 2",not proxy)

    note={"two":"Frame 3 is No Show. Alex Carter was randomly nominated for Frame 4, and both available players were entered into the doubles.","three":"Ben Morris was randomly nominated for Frame 4. Choose any two players from Frames 1–3 for the doubles."}.get(mode)
    action_y=1152
    if note:
        rounded(d,(55,1150,1165,1230),"#f0fdfa","#99f6e4")
        text(d,(73,1168),"Lineup rule applied",17,"#115e59",True); wrap(d,(250,1167),note,880,16,"#334155"); action_y=1250
    rounded(d,(55,action_y,1165,action_y+130),"#f0f9ff","#7dd3fc")
    text(d,(73,action_y+17),"Lineup actions",19,bold=True)
    text(d,(73,action_y+47),"Review all five frames, then save the draft or submit the lineup.",16,"#475569")
    rounded(d,(73,action_y+76,285,action_y+118),"white","#cbd5e1",10); text(d,(93,action_y+89),"Save lineup draft",15,bold=True)
    rounded(d,(302,action_y+76,555,action_y+118),"#0369a1","#0369a1",10); text(d,(322,action_y+89),"Submit team to opponent",15,"white",True)
    im.crop((24,24,1197,min(1427,action_y+155))).save(OUT/filename)

for mode,name in [("four","captain-winter-four-player.png"),("two","captain-winter-two-player.png"),("three","captain-winter-three-player.png"),("proxy","captain-proxy-entry.png")]:
    make(mode,name)
