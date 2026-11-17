import json,sys
from PIL import Image
g=json.load(open('src/data/grand-rapids.json'))
S=g["size"];im=Image.new('RGB',(S,S));h=None;V=S+1
col={'p':(60,170,70),'g':(120,190,90),'s':(150,210,100),'u':(200,200,120),'k':(220,200,140),'h':(230,150,150),'z':(200,200,200),'i':(200,170,90),'r':(150,190,120),'c':(170,170,120),'w':(120,120,120)}
for y in range(S):
  for x in range(S):
    c=(235,235,230)
    if g['water'][y][x]=='1': c=(40,90,200)
    elif g['parcel'][y][x]!='.': c=(200,90,60)
    elif g['land'][y][x]!='.': c=col.get(g['land'][y][x],(0,255,0))
    im.putpixel((x,y),c)
im.resize((672,672),Image.NEAREST).save(sys.argv[1])
