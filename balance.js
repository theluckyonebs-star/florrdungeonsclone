/* ══════════════════════════════════════════════════════════════════════════════════════
   BALANCE DATA  ·  mob & petal stats and all their scaling formulas.
   This file is loaded (via <script src="balance.js">) before index.html's main script, so
   everything here is just plain global constants/functions — edit numbers directly, no need
   to touch index.html at all for balance tweaks. Game logic, rendering, and UI all stay in
   index.html and just reference these globals.
   ══════════════════════════════════════════════════════════════════════════════════════ */

/* ── difficulty zones — left to right, each locked to a mob-level band ── */
const ZONES = [
  { name:'Garden',  idx:0, bg:'#1e8a42', levels:[1,5,10] },
  { name:'Desert',  idx:1, bg:'#a68a1e', levels:[15,20,25] },
  { name:'Mesa',    idx:2, bg:'#8a2e1e', levels:[30,35,40] },
  { name:'Glacier', idx:3, bg:'#bfe0e8', levels:[45,50,55] },
  { name:'Abyss',   idx:4, bg:'#232326', levels:[70] },
];

/* ══════════════════════════════════════════
   RARITY (cosmetic, fixed per petal) & TIER (power progression, 1-6)
   ══════════════════════════════════════════ */
const RARITIES = ['common','unusual','rare','epic','legendary','mythic'];
// which rarity (→ container color) each petal belongs to — fixed forever, unrelated to tier
const PETAL_RARITY = {
  basic:'common', rose:'common', rock:'common', light:'common', stinger:'common',
  faster:'unusual', leaf:'unusual', honey:'unusual',
  web:'rare', mandible:'rare', dahlia:'rare',
  heavy:'epic', pollen:'epic',
  wing:'legendary', tulip:'legendary',
  thirdEye:'mythic', moon:'mythic',
};
const TIERS = [1,2,3,4,5,6];
const MAX_TIER = 6;
// every petal scales 3x per tier (mythics never tier past 1, so this never applies to them)
function tierStep(petalId){ return 3; }
function tierScale(petalId, tier){ return Math.pow(tierStep(petalId), (tier||1)-1); }
// a handful of special stats scale at their own rate instead of the standard 3x/tier —
// a step of 1 means "flat, never scales with tier" (1^anything === 1)
const SPECIAL_TIER_STEP = {
  wing:      { reach: 1 },        // always exactly its base reach, regardless of tier
  faster:    { rotBonus: 1.2 },
  thirdEye:  { rangeBonus: 1 },   // always exactly +100% — it only ever exists at mythic tier 6
  mandible:  { slowMult: 1.5, slowDur: 1.5 },
  honey:     { slowMult: 1.5, slowDur: 1.5 },
};
function specialTierScale(petalId, statKey, tier){
  const override = SPECIAL_TIER_STEP[petalId] && SPECIAL_TIER_STEP[petalId][statKey];
  const step = override != null ? override : tierStep(petalId);
  return Math.pow(step, (tier||1)-1);
}
// flat compensation multiplier on health/damage/heal for harder-to-get rarities — petals no
// longer out-scale each other via rarity crafting, so rarity buffs this way instead
const RARITY_BUFF = { common:1, unusual:1, rare:2, epic:4, legendary:8, mythic:1 };
// rarer petals are forged straight into a higher starting tier — they immediately carry that
// tier's stat buffs, rather than starting from scratch at tier 1 like commons do
const RARITY_START_TIER = { common:1, unusual:2, rare:3, epic:4, legendary:5, mythic:6 };
function tierPossible(petal, tier){ return tier >= RARITY_START_TIER[PETAL_RARITY[petal]]; }
function pscale(def, key, petalId, tier){
  const rarity = PETAL_RARITY[petalId];
  if (petalId==='moon'){
    if (key==='health') return Infinity;
    if (key==='damage') return (def.damage||0) * 10 * tierScale(petalId, tier);
  }
  const buff = RARITY_BUFF[rarity] != null ? RARITY_BUFF[rarity] : 1;
  return (def[key]||0) * buff * tierScale(petalId, tier);
}
// secondary "buff" stats (rotation speed, range, reach, slow strength) scale with the same
// per-tier metric as normal stats — no separate rarity multiplier for these
function scaledSlowMult(def, petalId, tier){
  const reduction = (1 - (def.slowMult!=null ? def.slowMult : 1)) * specialTierScale(petalId, 'slowMult', tier);
  return clamp(1 - reduction, 0, 1);
}
function scaledSlowDur(def, petalId, tier){ return (def.slowDur||1.5) * specialTierScale(petalId, 'slowDur', tier); }
// bonus max-flower-HP multiplier while equipped (Dahlia/Tulip) — base value at tier 1, scaling
// with that petal's own tier step just like every other stat
const FLOWER_HP_PETALS = { dahlia: 2, tulip: 5 };

/* ══════════════════════════════════════════
   DROP TABLES  ·  per mob level, the % chance for EACH petal in a mob's drop list to drop,
   keyed by that petal's fixed rarity — every petal on the list is rolled independently
   ══════════════════════════════════════════ */
const DROP_RATE_TABLE = {
  1:  { common:15,  unusual:1,   rare:0.1, epic:0,    legendary:0,    mythic:0 },
  5:  { common:30,  unusual:2,   rare:0.2, epic:0,    legendary:0,    mythic:0 },
  10: { common:50,  unusual:5,   rare:0.3, epic:0,    legendary:0,    mythic:0 },
  15: { common:100, unusual:15,  rare:1,   epic:0.1,  legendary:0,    mythic:0 },
  20: { common:100, unusual:30,  rare:2,   epic:0.2,  legendary:0,    mythic:0 },
  25: { common:100, unusual:50,  rare:5,   epic:0.3,  legendary:0,    mythic:0 },
  30: { common:100, unusual:100, rare:10,  epic:0.5,  legendary:0.05, mythic:0 },
  35: { common:100, unusual:100, rare:20,  epic:1,    legendary:0.1,  mythic:0 },
  40: { common:100, unusual:100, rare:40,  epic:3,    legendary:0.2,  mythic:0 },
  45: { common:100, unusual:100, rare:80,  epic:5,    legendary:1,    mythic:0.001 },
  50: { common:100, unusual:100, rare:80,  epic:10,   legendary:2,    mythic:0.005 },
  55: { common:100, unusual:100, rare:80,  epic:20,   legendary:3,    mythic:0.01 },
  70: { common:100, unusual:100, rare:100, epic:50,   legendary:10,   mythic:0.1 },
};
/* ── Zone jackpots (multicopies) ──────────────────────────────────────────────────────────
   Each rarity's jackpot multiplier is introduced one zone later than the previous rarity's
   (common@zone1, unusual@zone2, rare@zone3, epic@zone4, legendary@zone5 — mythic never gets one),
   and every zone from there on adds the next multiplier in the shared sequence 5/25/200/2000/50000.
   Within a zone, mobs come in 3 level-tiers (e.g. Garden = levels 1/5/10 = tier 1/2/3). A jackpot's
   roll chance depends on how many zones past ITS OWN introduction zone the mob's zone is:
     - 0 zones past ("just learned"): 2% / 5% / 20% for tier 1/2/3
     - 1+ zones past ("risen"):        50% / 75% / 100% for tier 1/2/3
   This chance is a percentage OF the drop already having happened, not a separate independent
   roll — a jackpot can only apply to a rarity that actually dropped. When several jackpot tiers
   are simultaneously active (e.g. common in zone 5 has all 5), the highest multiplier is tried
   first, falling through to the next-highest, and so on until one hits (guaranteed once a 100%
   tier is reached). Abyss has only one mob level, so it counts as tier 3 (the zone's hardest). ──*/
const ZONE_MULTIPLIER_SEQUENCE = [5, 25, 200, 2000, 50000];
const RARITY_INTRO_ZONE = { common:1, unusual:2, rare:3, epic:4, legendary:5 }; // mythic: none
const MULTICOPY_CHANCE_NEW   = [2, 5, 20];   // 0 zones past introduction, by mob sub-tier 1/2/3
const MULTICOPY_CHANCE_RISEN = [50, 75, 100]; // 1+ zones past introduction, by mob sub-tier 1/2/3
// hidden jackpots — universal (any rarity, any zone), never shown in the gallery, and they
// stack multiplicatively with whatever the zone jackpot above already rolled
const HIDDEN_JACKPOTS = [ {mult:500, pct:0.1}, {mult:20, pct:1}, {mult:5, pct:5} ]; // highest first
// the zone jackpot tiers for a rarity, ascending by zone (== ascending by multiplier)
function zoneJackpotTiers(rarity){
  const introZone = RARITY_INTRO_ZONE[rarity];
  if (introZone==null) return [];
  const tiers = [];
  for (let i=0; introZone+i<=5; i++) tiers.push({ zone: introZone+i, mult: ZONE_MULTIPLIER_SEQUENCE[i] });
  return tiers;
}
function zoneAndSubTierForLevel(level){
  const zone = ZONES.find(z => z.levels.includes(level));
  if (!zone) return null;
  const subTier = zone.levels.length===1 ? 3 : zone.levels.indexOf(level)+1;
  return { zoneNum: zone.idx+1, subTier };
}
function rollZoneJackpot(rarity, zoneNum, subTier){
  const tiers = zoneJackpotTiers(rarity);
  for (let i=tiers.length-1; i>=0; i--){
    const t = tiers[i];
    if (t.zone > zoneNum) continue; // not introduced yet at this mob's zone
    const zonesPast = zoneNum - t.zone;
    const chance = zonesPast===0 ? MULTICOPY_CHANCE_NEW[subTier-1] : MULTICOPY_CHANCE_RISEN[subTier-1];
    if (Math.random()*100 < chance) return t.mult;
  }
  return 1;
}
function rollHiddenJackpot(){
  for (const h of HIDDEN_JACKPOTS){ if (Math.random()*100 < h.pct) return h.mult; }
  return 1;
}
function rollMobDrops(m){
  const table = DROP_RATE_TABLE[m.level];
  if (!table) return;
  const zt = zoneAndSubTierForLevel(m.level);
  for (const rarity of MOB_DEFS[m.type].drops){
    const pct = table[rarity] || 0;
    if (Math.random()*100 < pct){
      const zoneMult = zt ? rollZoneJackpot(rarity, zt.zoneNum, zt.subTier) : 1;
      const count = zoneMult * rollHiddenJackpot();
      spawnEssencePickup(m.x, m.y, rarity, count);
    }
  }
}

/* ══════════════════════════════════════════
   PETAL DEFINITIONS
   ══════════════════════════════════════════ */
const PETAL_DEFS = {
  basic:    { name:'Basic',    color:'#f2f2f2', shape:'circle', health:10, damage:10, reload:2.5, desc:'A balanced starting petal.' },
  wing:     { name:'Wing',     color:'#eaeaea', shape:'drop',   health:10, damage:10, reload:2.1, reach:36, desc:"Extends a little further when attacking and reloads a bit faster." },
  leaf:     { name:'Leaf',     color:'#4ade80', shape:'leaf',   health:10, damage:10, reload:2.5, healPerSec:1, desc:'Passively heals the flower a little while equipped.' },
  rose:     { name:'Rose',     color:'#f472b6', shape:'circle', health:100, damage:2,  reload:2.5, armTime:0.5, healBurst:30, defensive:true, desc:"Deals minimal damage but has hugely improved HP. Defensive — doesn't expand outward when you attack. Arms for 0.5s once you need healing, then self-destructs for a big heal." },
  light:    { name:'Light',    color:'#fff27a', shape:'ring',   health:10, damage:10, reload:1.0, desc:'Reloads significantly faster than a basic petal.' },
  stinger:  { name:'Stinger',  color:'#1a1a1a', shape:'triangleSide', health:1,  damage:45, reload:4.0, desc:'Extremely fragile with a slow reload, but deals ridiculous damage.' },
  honey:    { name:'Honey',    color:'#e8a916', shape:'drop',   health:10, damage:1,  reload:2.5, slowMult:0.5, slowDur:2, desc:"Deals 10x less damage, but halves a mob's movement speed on hit." },
  faster:   { name:'Faster',   color:'#ffcc33', shape:'circle', health:10, damage:10, reload:2.1, rotBonus:0.35, desc:'Reloads a little faster and speeds up your whole petal ring while active.' },
  web:      { name:'Web',      color:'#d1d5db', shape:'web',    health:10, damage:10, reload:2.5, projectile:true, projSpeed:520, projLife:3, fireRange:300, desc:'Fires at a nearby mob, flying fast in a straight line until it hits or expires after 3s.' },
  mandible: { name:'Mandible', color:'#a8763e', shape:'pincer', health:10, damage:10, reload:2.5, slowMult:0.75, slowDur:2, desc:"Basic stats, but slows a mob's movement to 0.75x on hit." },
  dahlia:   { name:'Dahlia',   color:'#f472b6', shape:'cluster',health:50, damage:0,  reload:1.875, armTime:0.5, healBurst:7.875, defensive:true, parts:3, desc:'Three miniature Roses — faster reload, but a much smaller heal each.' },
  pollen:   { name:'Pollen',   color:'#fff27a', shape:'dust',   health:10, damage:4,  reload:1.0, parts:3, desc:'Three miniature Lights, each hitting for 0.4x damage.' },
  thirdEye: { name:'Third Eye',color:'#a855f7', shape:'eye',    health:10, damage:10, reload:2.5, rangeBonus:1, desc:'Drastically extends the reach of your whole petal ring while attacking.' },
  tulip:    { name:'Tulip',    color:'#f472b6', shape:'tulipflower', health:50, damage:0, reload:2.5, armTime:0.5, healBurst:30, defensive:true, parts:2, desc:'Spawns two full Roses.' },
  rock:     { name:'Rock',     color:'#9c9c9c', shape:'rock',   health:25, damage:7, reload:3.5, desc:'Higher HP than a basic petal, at the cost of lower damage and a slower reload.' },
  heavy:    { name:'Heavy',    color:'#6b6b6b', shape:'rock',   health:60, damage:10, reload:4.0, desc:'Significantly higher HP than normal, at the cost of a slow reload.' },
  moon:     { name:'Moon',     color:'#dfe7ff', shape:'crescent',health:500,damage:10, reload:10.0, desc:'Ridiculous amounts of HP, but an extremely slow reload.' },
};
// Forging — a guaranteed-success way to obtain ANY petal at tier 1, spending essence of that
// petal's rarity. Cost is a flat 5 for common/unusual/rare, 10 for epic+, shown across the same
// 5-slot craft-pentagon layout (1 essence/slot, or 2/slot for epic+).
function forgeCost(rarity){ return (rarity==='epic'||rarity==='legendary'||rarity==='mythic') ? 10 : 5; }
// combine CRAFT_COST of the same petal+tier for a chance at the next tier up
const CRAFT_COST = 5;
const CRAFT_CHANCE = { 1:50, 2:25, 3:10, 4:5, 5:2 }; // keyed by current tier; tier 6 has no next tier

/* ══════════════════════════════════════════
   MOB DEFINITIONS
   ══════════════════════════════════════════ */
const MOB_KNOCKBACK = 155; // uniform for every mob unless a gimmick overrides it
// drops: every mob can drop essence of any rarity for now (deduped list kept purely so the
// per-mob "flavor" is easy to bring back later — currently all 6 rarities for every mob)
const ALL_RARITIES_DROP = [...RARITIES];
// stats rebalanced around a new Ladybug baseline of 100 hp / 10 dmg, scaling every other mob's
// old health by 100/45 and old contactDmg/petalDmg by 10/8 to preserve their existing ratios.
// aggroRange is the level-1/common-zone base value — it scales up via aggroRangeScale below.
const MOB_DEFS = {
  ant: {
    name:'Ant', r:20, health:122, contactDmg:17.5, petalDmg:12.5, mass:3, friction:7,
    speed:200, behavior:'neutral', color:'#6b3f1d', weight:25,
    drops:ALL_RARITIES_DROP,
  },
  ladybug: {
    name:'Ladybug', r:22, health:100, contactDmg:10, petalDmg:7.5, mass:1.3, friction:6,
    speed:60, behavior:'passive', color:'#e6352b', weight:30,
    drops:ALL_RARITIES_DROP,
  },
  bee: {
    name:'Bee', r:16, health:67, contactDmg:30, petalDmg:17.5, mass:1.2, friction:5,
    speed:200, behavior:'neutral-swerve', color:'#ffcf33', weight:20,
    drops:ALL_RARITIES_DROP,
  },
  spider: {
    name:'Spider', r:24, health:71, contactDmg:17.5, petalDmg:11.25, mass:8, friction:8,
    speed:240, behavior:'hostile', aggroRange:260, color:'#2b2b33', weight:15,
    drops:ALL_RARITIES_DROP,
  },
  rock: {
    name:'Rock', r:30, health:289, contactDmg:5, petalDmg:11.25, mass:45, friction:12,
    speed:0, behavior:'stationary', color:'#8d8d94', weight:10,
    drops:ALL_RARITIES_DROP,
  },
  beetle: {
    name:'Beetle', r:44, health:133, contactDmg:27.5, petalDmg:16.25, mass:5, friction:7,
    speed:300, behavior:'hostile', aggroRange:160, color:'#3a2a6b', weight:12, minZone:1, // can't spawn in the Garden zone
    drops:ALL_RARITIES_DROP,
  },
};
const MOB_LEVELS = [1,5,10,15,20,25,30,35,40,45,50,55,70];
function mobLevelScale(level){ return Math.pow(3, Math.floor(level/5)); }
// aggro range starts lower (see MOB_DEFS.aggroRange above) and grows 1.1x every 5 levels —
// much gentler than the 3x/5-level health/damage curve, so high-level hostiles notice you
// from further away without becoming absurdly HP/damage-scaled on top of it
function aggroRangeScale(level){ return Math.pow(1.1, Math.floor(level/5)); }
const SIZE_BY_LEVEL = {1:1,5:1.05,10:1.1,15:1.15,20:1.2,25:1.3,30:1.4,35:1.5,40:1.6,45:1.8,50:2.0,55:2.3,70:3.2};
// hostile mobs get more common the harder the zone; passive mobs get more common the easier it is.
// neutral/stationary mobs are unaffected. A mob with minZone set can't spawn in easier zones at all.
const HOSTILE_ZONE_MULT = [0.4, 0.8, 1.4, 2, 2.6];
const PASSIVE_ZONE_MULT = [2.6, 2, 1.4, 0.8, 0.4];
function zoneMobWeight(def, zoneIdx){
  if (zoneIdx < (def.minZone||0)) return 0;
  if (def.behavior==='hostile') return def.weight * HOSTILE_ZONE_MULT[zoneIdx];
  if (def.behavior==='passive') return def.weight * PASSIVE_ZONE_MULT[zoneIdx];
  return def.weight;
}
// XP is derived from the mob's actual (level-scaled) health and damage instead of a
// hand-picked constant, so tougher mobs — at any level — are always worth more
function xpForKill(mobTypeKey, level){
  const def = MOB_DEFS[mobTypeKey];
  const scale = mobLevelScale(level);
  return Math.max(1, Math.round(0.25 * Math.sqrt(def.health*scale * def.contactDmg*scale)));
}
