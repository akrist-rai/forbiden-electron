const PANEL_IMGS = [
  'Guts.jpeg','Whitebeard.jpeg','Roronoa Zoro.jpeg','PANTHEON.jpeg',
  'Thorfinn _ Vinland saga.jpeg','Choujin X.jpeg','THE CONTROL DEVIL _ GRAPHIC DESIGN.jpeg',
  'God Valley.jpeg','MATT TAYLOR.jpeg','SUBWAY DIMENSIONS.jpeg',
  'Queen Marika the Eternal.jpeg','VOGUE.jpeg','Sight - SKJEGG.jpeg',
  'Poster - Veil.jpeg','SONS OF THE DEVIL Covers 1-5 - toni infante.jpeg',
  'denji starboy album cover.jpeg','yhwach god of the Quincy.jpeg',
  'Makima! 🩸__#Makima #ChainsawMan_#ChainsawManFanart #AnimeArt_#DigitalPainting.jpeg',
  'チェンソーマン ＃１.jpeg','𝐔𝐬𝐨𝐩𝐩.jpeg','Poster One Piece - Wanted Whitebeard 61x91,5cm _ bol.jpeg',
  'CHAOS SMILE.jpeg','Fire Punch.jpeg','Nelliel Brutalism.jpeg',
  '#chainsawman.jpeg',
  'Burning - Inspired by Van Gogh.jpeg',
  "I'LL TAKE CARE OF YOU _ TYLER THE CREATOR _ DON'T TAP THE GLASS _ FLOWER BOY.jpeg",
  'Kagurabachi X Bleach.jpeg','Kyora Sazanami Poster.jpeg',
  '0xMC001x.jpeg','0xMC002x.jpeg','0xMC003x.jpeg',
  '0xEP001p.jpeg','0xEP002p.jpeg','0xEP003p.jpeg','0xEP004p.jpeg','0xEP005p.jpeg',
  '0xEP006p.jpeg','0xEP007p.jpeg','0xEP008p.jpeg','0xEP009p.jpeg','0xEP010p.jpeg',
  '0xEP011p.jpeg','0xEP012p.jpeg','0xEP013p.jpeg','0xEP014p.jpeg','0xEP015p.jpeg',
  '0xEP016p.jpeg','0xEP017p.jpeg','0xEP018p.jpeg','0xEP019p.jpeg','0xEP020p.jpeg',
  '0xEP021p.jpeg','0xEP022p.jpeg','0xEP023p.jpeg','0xEP024p.jpeg','0xEP025p.jpeg',
  '0xEP026p.jpeg','0xEP027p.jpeg','0xEP028p.jpeg','0xEP029p.jpeg','0xEP030p.jpeg',
  '0xEP031p.jpeg','0xEP032p.jpeg','0xEP033p.jpeg','0xEP034p.jpeg','0xEP035p.jpeg',
  '0xEP036p.jpeg','0xEP037p.jpeg','0xEP038p.jpeg','0xEP039p.jpeg','0xEP040p.jpeg',
  '0xEP041p.jpeg','0xEP042p.jpeg','0xEP043p.jpeg','0xEP044p.jpeg','0xEP045p.jpeg',
  '0xEP046p.jpeg','0xEP047p.jpeg','0xEP048p.jpeg','0xEP049p.jpeg','0xEP050p.jpeg',
  '0xEP051p.jpeg','0xEP052p.jpeg','0xEP053p.jpeg','0xEP054p.jpeg','0xEP055p.jpeg',
  '0xEP056p.jpeg','0xEP057p.jpeg','0xEP058p.jpeg','0xEP059p.jpeg','0xEP060p.jpeg',
  '0xEP061p.jpeg','0xEP062p.jpeg','0xEP069p.jpeg','0xEP070p.jpeg','0xEP071p.jpeg',
  '0xEP072p.jpeg','0xEP073p.jpeg','0xEP074p.jpeg','0xEP075p.jpeg','0xEP076t.jpeg',
  '0xEP077t.jpeg','0xEP078t.jpeg','0xEP079t.jpeg','0xEP080t.jpeg','0xEP081t.jpeg',
  '0xEP082t.jpeg','0xEP083t.jpeg',
]

const BASE = import.meta.env.BASE_URL

export function getMangaImgSrc(nodeId: string, themeIdx: number): string {
  const numId = parseInt(nodeId.replace(/\D/g, '')) || 0
  const idx = (numId * 11 + themeIdx * 7) % PANEL_IMGS.length
  return `${BASE}manga/${encodeURIComponent(PANEL_IMGS[idx])}`
}

export function getPanelImg(seed: number): string {
  return `${BASE}manga/${encodeURIComponent(PANEL_IMGS[seed % PANEL_IMGS.length])}`
}
