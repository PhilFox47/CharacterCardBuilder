"""Kink / fetish / attraction database.

A curated menu the card generator draws sexuality tags FROM, instead of
free-associating (which collapses to the same handful of tropes every time —
praise kink, edging, bondage, brat taming...).

TWO AXES
--------
1. BREADTH (a database property of each entry, set here):
     "broad"    — a whole domain/umbrella, e.g. BDSM, foot fetish, exhibitionism
     "niche"    — a distinct practice within a domain, e.g. bondage, footjobs
     "specific" — one concrete act or detail, e.g. toe sucking, redheads
   Breadth guides COMPOSITION: anchor a character on a broad drive or two, then
   express it with niche/specific picks.

2. LEVEL (a character property, assigned per-tag by the generator on the card,
   NOT stored here):
     (Fetish)     — a must-have; craved, sought out, sex feels incomplete without it
     (Kink)       — strongly into it; a reliable, actively-enjoyed turn-on
     (Preference) — a like; welcome and enjoyed, but optional

This whole file lives in the GENERATION prompt only, so it costs tokens once per
card generation and adds NOTHING to the card's own length — the finished card
carries only the handful of tags the model selected, each with its Level.

Entries are (term, breadth) tuples. Edit freely; render_vocabulary() rebuilds
the injected text from them. Gated categories may be used ONLY when the user has
explicitly established that kind of content in the conversation.
"""

# ── Always available ────────────────────────────────────────────────────────────
DATABASE = {
    "Attraction & types (what draws them physically)": [
        ("redheads", "specific"), ("blondes", "specific"), ("dark hair", "specific"),
        ("older partners", "niche"), ("younger adult partners", "niche"),
        ("large age gap", "niche"), ("muscular build", "specific"),
        ("soft/heavy build", "specific"), ("thick/curvy bodies", "specific"),
        ("petite bodies", "specific"), ("tall partners", "specific"),
        ("androgyny", "niche"), ("masculinity", "niche"), ("femininity", "niche"),
        ("tomboys", "specific"), ("beards/body hair", "specific"),
        ("hairy vs. smooth preference", "specific"), ("freckles", "specific"),
        ("glasses", "specific"), ("tattoos", "specific"), ("piercings", "specific"),
        ("exotic/ethnic attraction", "niche"), ("height difference", "niche"),
        ("hands", "specific"), ("necks/collarbones", "specific"), ("thighs", "specific"),
        ("legs", "specific"), ("ass focus", "specific"), ("breast focus", "specific"),
        ("navel/belly", "specific"), ("back/spine", "specific"),
        ("lips/mouth", "specific"), ("eyes", "specific"),
        ("scent/musk attraction", "niche"), ("voice attraction", "specific"),
        ("uniforms as attraction", "niche"), ("intelligence/competence", "niche"),
        ("danger/bad partners (hybristophilia)", "niche"),
        ("innocence/inexperience", "niche"), ("blushing/shyness", "specific"),
        ("fangs/vampiric", "specific"), ("femboys", "specific"), ("twinks", "specific"),
        ("bears/burly", "specific"), ("MILF/DILF", "specific"), ("goth/alt aesthetic", "specific"),
        ("trans partners", "niche"), ("pregnant partners", "niche"),
        ("abs/athletic physique", "specific"), ("gerontophilia (elderly attraction)", "niche"),
    ],
    "Core sex acts": [
        ("penetrative sex", "broad"), ("oral sex", "broad"), ("vaginal sex", "niche"),
        ("anal sex", "niche"), ("blowjobs", "niche"), ("cunnilingus", "niche"),
        ("deep throating", "specific"), ("face fucking", "specific"),
        ("double penetration", "specific"), ("face sitting", "specific"),
        ("facials", "specific"), ("fingering", "niche"), ("fisting", "specific"),
        ("handjobs", "niche"), ("intercrural/thigh sex", "specific"),
        ("mutual masturbation", "niche"), ("pegging", "niche"), ("rimming", "specific"),
        ("scissoring", "specific"), ("toys (dildos/plugs/vibrators)", "niche"),
        ("titty fucking", "specific"), ("footjobs", "specific"), ("69ing", "specific"),
        ("anal training", "niche"), ("anal gaping", "specific"), ("prostate play", "niche"),
        ("prostate milking", "specific"), ("position play (doggy/cowgirl/spooning)", "niche"),
        ("ass to mouth (ATM)", "specific"), ("nipple orgasm", "specific"),
        ("dry humping/frottage", "specific"),
    ],
    "Sex types, settings & pacing": [
        ("rough sex", "niche"), ("gentle/tender sex", "niche"), ("angry sex/hatefucking", "niche"),
        ("passionate/desperate sex", "niche"), ("slow teasing sex", "niche"),
        ("quickies", "specific"), ("marathon/overstimulating sex", "niche"),
        ("casual sex/fuck buddies", "niche"), ("car sex", "specific"),
        ("shower/bath sex", "specific"), ("sex against a wall", "specific"),
        ("public/semi-public sex", "niche"), ("outdoor sex", "specific"),
        ("mirror sex (katoptronophilia)", "specific"), ("drunk sex", "specific"),
        ("sleepy/morning sex", "specific"), ("phone sex/sexting", "specific"),
        ("makeup/reconciliation sex", "specific"), ("first time together", "specific"),
        ("risk of getting caught", "specific"), ("breakup/goodbye sex", "specific"),
        ("office/workplace sex", "specific"), ("hotel/motel sex", "specific"),
    ],
    "Oral fixation, fluids & mess": [
        ("bodily fluids", "broad"), ("creampie", "niche"), ("cum play", "niche"),
        ("swallowing cum", "specific"), ("facials/bukkake", "specific"),
        ("snowballing", "specific"), ("squirting", "niche"),
        ("watersports (urolagnia)", "niche"), ("omorashi (wetting/desperation)", "specific"),
        ("spit as lube", "specific"), ("spitting in mouth", "specific"),
        ("drool/messy oral", "specific"), ("sweat", "specific"),
        ("lactation/hucow", "niche"), ("tears/crying (dacryphilia)", "specific"),
        ("menstrual blood", "specific"), ("fingers in mouth", "specific"),
        ("oral fixation (sucking, licking)", "niche"),
        ("diapers/ABDL (adults)", "niche"), ("felching", "specific"),
        ("scat (coprophilia)", "specific"), ("vomit (emetophilia)", "specific"),
        ("wet & messy / sploshing (WAM)", "niche"), ("cum swapping", "specific"),
        ("sloppy/messy blowjobs", "specific"), ("precum", "specific"),
        ("gokkun (drinking accumulated cum)", "specific"),
    ],
    "Body worship & modification": [
        ("body worship", "broad"), ("foot fetish (podophilia)", "broad"), ("footjob", "niche"),
        ("toe sucking", "specific"), ("sole/arch focus", "specific"),
        ("sock/shoe sniffing", "specific"), ("ass worship (pygophilia)", "niche"),
        ("breast/nipple worship (mazophilia)", "niche"), ("cock worship", "niche"),
        ("muscle worship (sthenolagnia)", "niche"), ("belly/soft-body focus", "specific"),
        ("armpits (maschalagnia)", "specific"), ("hair fetish (trichophilia)", "niche"),
        ("hair pulling", "specific"), ("hickies/marking", "specific"),
        ("nipple play", "niche"), ("belly/throat bulge", "specific"),
        ("piercings (genital/nipple)", "specific"), ("tattoos on a partner", "specific"),
        ("shaving/grooming a partner", "specific"), ("body writing", "specific"),
        ("scars", "specific"), ("nose fixation (nasophilia)", "specific"),
        ("foot worship", "niche"), ("boot worship/licking", "specific"),
        ("leg worship", "specific"), ("trampling", "specific"),
        ("smothering (face/thighs)", "specific"),
    ],
    "Clothing, materials & cosplay": [
        ("clothing fetish", "broad"), ("lingerie", "niche"), ("underwear/panties", "niche"),
        ("stockings/hosiery", "specific"), ("pantyhose/nylons", "specific"),
        ("high heels", "specific"), ("corsets", "specific"), ("latex", "niche"),
        ("leather", "niche"), ("spandex/lycra", "specific"), ("fur", "specific"),
        ("denim", "specific"), ("silk", "specific"), ("wetlook", "specific"),
        ("uniforms", "niche"), ("maid/apron", "specific"), ("costumes/cosplay", "niche"),
        ("crossdressing", "niche"), ("clothed sex", "specific"), ("gloves", "specific"),
        ("socks", "specific"), ("sneakers/trainers", "specific"), ("boots", "specific"),
        ("shoeplay/dangling", "specific"), ("yoga pants/leggings", "specific"),
        ("swimwear/bikini", "specific"), ("PVC/vinyl", "specific"),
        ("garters/suspenders", "specific"), ("schoolgirl outfit", "specific"),
        ("cheerleader outfit", "specific"),
        ("collars/chokers", "specific"), ("makeup/lipstick", "specific"),
        ("torn/used clothing", "specific"), ("dressing a partner up", "specific"),
    ],
    "Dominance, submission & power": [
        ("dominance/submission", "broad"), ("BDSM", "broad"), ("power exchange", "broad"),
        ("dominant (giving)", "niche"), ("submissive (taking)", "niche"),
        ("switching", "niche"), ("service submission", "niche"), ("bratty submission", "niche"),
        ("brat taming", "specific"), ("free use", "niche"), ("orgasm control", "niche"),
        ("edging", "specific"), ("orgasm denial", "specific"), ("forced orgasms", "specific"),
        ("ruined orgasms", "specific"), ("chastity/cages", "niche"), ("cockwarming", "specific"),
        ("sounding", "specific"), ("collaring/ownership", "niche"), ("leashes", "specific"),
        ("kneeling/positions", "specific"), ("begging", "specific"), ("commands/protocol", "niche"),
        ("daddy kink", "niche"), ("mommy kink", "niche"), ("master/slave", "niche"),
        ("pet play", "niche"), ("puppy play", "niche"), ("pony play", "niche"),
        ("kitten play", "specific"), ("human furniture/objectification", "niche"),
        ("discipline/punishment", "niche"), ("bathroom/permission control", "specific"),
        ("financial domination (findom)", "niche"), ("hypno/trance play (consensual)", "niche"),
        ("sissification/forced-fem play (consensual)", "niche"),
        ("bimbofication/dumbification", "niche"), ("forced bi", "niche"),
        ("24/7 total power exchange (TPE)", "niche"), ("keyholding (chastity)", "specific"),
        ("gentle femdom/gentle domination", "niche"),
    ],
    "Restraint & bondage": [
        ("bondage", "broad"), ("light restraint (wrists held)", "specific"),
        ("handcuffs", "specific"), ("rope/shibari", "niche"), ("suspension", "specific"),
        ("spreader bars", "specific"), ("blindfolds", "specific"), ("gags", "specific"),
        ("hoods/masks", "specific"), ("sensory deprivation", "niche"),
        ("straightjackets", "specific"), ("harnesses", "specific"), ("anal hooks", "specific"),
        ("predicament bondage", "specific"), ("furniture/frame bondage", "specific"),
        ("mummification", "specific"), ("vacuum bed / vacbed", "specific"),
        ("encasement", "niche"), ("tape bondage", "specific"), ("chains/shackles", "specific"),
        ("stocks/pillory", "specific"), ("self-bondage", "specific"),
    ],
    "Impact, pain & sensation": [
        ("impact play", "broad"), ("sadism/masochism", "broad"), ("sensation play", "broad"),
        ("spanking", "niche"), ("flogging/whipping", "niche"), ("caning", "specific"),
        ("riding crops/paddles", "specific"), ("slapping (face)", "specific"),
        ("choking/breath play", "niche"), ("biting", "specific"), ("scratching", "specific"),
        ("nipple clamps", "specific"), ("wax play", "specific"), ("temperature play (ice/heat)", "niche"),
        ("electrostimulation", "niche"), ("figging", "specific"), ("CBT (cock & ball torture)", "specific"),
        ("needles/play piercing", "specific"), ("tickling (knismolagnia)", "specific"),
        ("feather tickling (pteronophilia)", "specific"), ("pinching/marking", "specific"),
        ("rough manhandling", "niche"), ("belt whipping", "specific"),
        ("OTK (over-the-knee) spanking", "specific"), ("cock slapping", "specific"),
        ("cupping/suction", "specific"),
    ],
    "Humiliation, degradation & praise": [
        ("humiliation", "broad"), ("degradation", "broad"), ("praise kink", "broad"),
        ("dirty talk", "niche"), ("name-calling (slut/whore)", "specific"),
        ("verbal humiliation", "niche"), ("public humiliation", "niche"),
        ("small penis humiliation", "specific"), ("body-part mockery", "specific"),
        ("worship/being adored", "niche"), ("good-girl/good-boy praise", "specific"),
        ("exposure/being shown off", "niche"), ("objectification", "niche"),
        ("dehumanization (consensual)", "niche"), ("spitting/facials as degradation", "specific"),
        ("human ashtray/toilet (consensual)", "specific"), ("forced nudity/stripping", "niche"),
        ("cuckold humiliation", "specific"), ("sissy humiliation", "specific"),
        ("chastity humiliation", "specific"),
    ],
    "Roleplay & scenarios": [
        ("roleplay", "broad"), ("power-dynamic roleplay", "niche"),
        ("teacher/student", "specific"), ("boss/employee", "specific"),
        ("doctor/patient (medical play)", "niche"), ("stranger/pickup", "specific"),
        ("hunter/prey (consensual)", "niche"), ("captor/captive (consensual)", "niche"),
        ("ageplay (adult)", "niche"), ("pet/owner", "specific"), ("stepfamily fantasy", "niche"),
        ("nun/priest taboo (hierophilia)", "specific"), ("royalty/servant", "specific"),
        ("enemies-to-bed", "niche"), ("reluctant seduction", "niche"),
        ("statue/doll play (agalmatophilia)", "niche"), ("robot/AI partner", "niche"),
        ("prostitute/client", "specific"), ("cop/criminal", "specific"),
        ("vampire/supernatural seduction", "niche"),
    ],
    "Breeding, pregnancy & primal": [
        ("breeding/impregnation", "broad"), ("creampie/breeding focus", "niche"),
        ("pregnancy kink", "niche"), ("lactation", "specific"), ("primal play", "niche"),
        ("marking/claiming", "niche"), ("knotting (fantastical)", "specific"),
        ("heat/rut fantasy", "specific"), ("size difference", "niche"),
        ("stuffing/filling", "specific"), ("feederism/weight gain", "niche"),
        ("mpreg (male pregnancy, fantastical)", "specific"), ("cum inflation", "specific"),
    ],
    "Psychological & relational": [
        ("corruption", "broad"), ("obsession/possessiveness", "niche"),
        ("jealousy play", "niche"), ("cheating/infidelity fantasy", "niche"),
        ("cuckolding/hotwifing", "niche"), ("cuckqueaning", "niche"),
        ("candaulism (showing off a partner)", "niche"), ("compersion", "specific"),
        ("voyeurism", "broad"), ("exhibitionism", "broad"), ("being watched", "niche"),
        ("watching a partner", "niche"), ("competence kink", "niche"),
        ("first-time/deflowering fantasy", "niche"), ("forbidden/taboo thrill", "niche"),
        ("corruption of the innocent", "niche"), ("power-imbalance thrill", "niche"),
        ("emotional dominance", "niche"), ("aftercare", "niche"),
        ("praise-and-degrade whiplash", "specific"), ("devotion/service as arousal", "specific"),
        ("netorare (NTR)/netori", "niche"), ("polyamory", "niche"),
        ("yandere/obsessive devotion", "niche"), ("friends-to-lovers", "specific"),
        ("pining/unrequited tension", "specific"),
    ],
    "Group & multi-partner": [
        ("group sex", "broad"), ("threesomes", "niche"), ("gangbang", "niche"),
        ("spitroasting", "specific"), ("double penetration", "specific"),
        ("orgies", "niche"), ("swinging/partner swapping", "niche"),
        ("harem dynamic", "niche"), ("glory holes", "specific"),
        ("group humiliation/exposure", "specific"), ("bukkake", "specific"),
        ("reverse gangbang", "specific"),
    ],
    "Unusual & named (horizon-expanders)": [
        ("formicophilia (small creatures on skin)", "niche"),
        ("agalmatophilia (statues/dolls/mannequins)", "niche"),
        ("dacryphilia (arousal from crying)", "niche"),
        ("mysophilia (soiled/used items)", "niche"),
        ("ozolagnia (strong body smells)", "niche"),
        ("klismaphilia (enemas)", "niche"),
        ("trichophilia (hair)", "niche"),
        ("maschalagnia (armpits)", "specific"),
        ("acrotomophilia (amputee attraction)", "niche"),
        ("narratophilia (erotic talk/reading aloud)", "specific"),
        ("pictophilia (arousal from porn/images together)", "specific"),
        ("objectophilia (attraction to objects)", "niche"),
        ("mechanophilia (machines/vehicles)", "niche"),
        ("balloon fetish (looning)", "specific"),
        ("nyotaimori (food served on a body)", "specific"),
        ("stigmatophilia (tattoos/piercings/scars)", "niche"),
        ("hucow/human cow", "specific"),
        ("petrification/frozen play", "specific"),
        ("spectrophilia (spirit/ghost lovers)", "specific"),
        ("hierophilia (sacred/taboo settings)", "niche"),
        ("chronophilia (era/period roleplay attraction)", "specific"),
        ("eproctophilia (flatulence)", "specific"),
        ("salirophilia (soiling/dirtying a partner)", "niche"),
        ("coulrophilia (clowns)", "specific"),
    ],
    "Misc & aphrodisiac": [
        ("teasing/edging games", "niche"), ("sensual massage", "specific"),
        ("food play (sitophilia)", "niche"), ("erotic dancing/stripping", "niche"),
        ("lap dances", "specific"), ("aphrodisiacs/loss of inhibition", "niche"),
        ("intoxicated play (consensual)", "niche"), ("somnophilia (consensual)", "niche"),
        ("coming untouched", "specific"), ("coming on command", "specific"),
        ("overstimulation", "niche"), ("multiple orgasms", "specific"),
        ("frottage/grinding", "specific"), ("pet names", "specific"),
        ("sugar daddy/kept dynamic", "niche"), ("smoking", "specific"),
        ("fucking machine", "niche"), ("filming/sex tapes", "niche"),
        ("camming/webcam", "specific"),
    ],
}

# ── Gated — only if the user explicitly establishes this content ────────────────
GATED_DATABASE = {
    "Taboo & fantastical (only if the setting/user establishes it)": [
        ("incest/family taboo", "broad"), ("bestiality", "niche"), ("monsterfucking", "niche"),
        ("furry", "niche"), ("tentacles", "specific"), ("oviposition (egg-laying)", "specific"),
        ("xenophilia (alien)", "niche"), ("teratophilia (monstrous partners)", "niche"),
        ("transformation/TF", "niche"), ("macro/micro (size extremes)", "niche"),
        ("inflation", "specific"), ("vore", "specific"), ("dendrophilia (plants)", "specific"),
        ("body horror", "niche"), ("drug/chem play", "niche"), ("gunplay", "specific"),
        ("futanari (futa)", "niche"), ("hyperpregnancy", "specific"),
    ],
    "Dub-con / non-con (only if explicitly established)": [
        ("consensual non-consent (CNC)", "broad"), ("coercion/blackmail", "niche"),
        ("chremastistophilia (robbed/ambushed)", "specific"), ("drugging", "specific"),
        ("gaslighting/manipulation", "niche"), ("conditioning/training", "niche"),
        ("hypnosis/mind control", "niche"), ("mind break", "specific"),
        ("sex pollen/fuck-or-die", "specific"), ("somnophilia (non-con)", "specific"),
        ("non-con touching/groping (frotteurism)", "niche"), ("stockholm syndrome", "niche"),
        ("power-imbalance coercion", "niche"), ("dehumanization", "niche"),
        ("intoxicated/incapacitated non-con", "specific"), ("spying/hidden watching (non-con)", "specific"),
    ],
    "Extreme pain & gore (only if explicitly established)": [
        ("extreme pain", "broad"), ("bloodplay", "niche"), ("knife play", "niche"),
        ("branding", "specific"), ("burns/fire play", "specific"), ("amputation", "specific"),
        ("gore", "niche"), ("mutilation/wounds", "niche"), ("interrogation/torture", "niche"),
        ("mental torture", "niche"), ("castration/nullification", "specific"),
        ("snuff/death kink", "specific"), ("necrophilia", "specific"), ("cannibalism", "specific"),
        ("waterboarding/asphyxiation", "specific"),
        ("symphorophilia (staged accidents)", "specific"),
        ("autassassinophilia (staged death risk)", "specific"),
    ],
    "Extreme non-con (only if explicitly established)": [
        ("rape scenarios (victim or perpetrator)", "broad"), ("gang rape", "specific"),
        ("kidnapping/abduction", "niche"), ("brainwashing", "niche"),
        ("forced pregnancy/breeding", "specific"), ("forced servitude/slavery", "niche"),
        ("forced prostitution/trafficking", "niche"),
        ("domestic violence", "niche"), ("forced feminization/infantilization", "specific"),
    ],
}

_BREADTH_TAG = {"broad": "B", "niche": "N", "specific": "S"}


def render_vocabulary() -> str:
    """Render the database into the text block injected into the generation prompt."""
    lines = [
        "KINK VOCABULARY — a menu to draw a character's appetites and limits FROM, so "
        "they don't collapse to the same few tropes. Each entry is tagged by BREADTH: "
        "(B) broad domain · (N) niche practice · (S) specific act/detail. Anchor a "
        "character on one or two broad (B) drives, then make them concrete with niche (N) "
        "and specific (S) details. The 'Unusual & named' category is deliberately obscure — "
        "reach into it when a character should surprise the player with something new. "
        "IMPORTANT: express whatever you pick as FACTS ABOUT THE CHARACTER woven into the "
        "prose ('She's greedy about being pinned down and goes shy the instant she's praised'), "
        "never as a tagged list, a checklist, or a content rule.",
        "",
    ]
    for category, entries in DATABASE.items():
        rendered = " · ".join(f"{term} ({_BREADTH_TAG[breadth]})" for term, breadth in entries)
        lines.append(f"{category}: {rendered}")
    lines.append("")
    lines.append(
        "GATED — use ONLY if the user explicitly established this kind of content in "
        "the conversation; never introduce it on your own:"
    )
    for category, entries in GATED_DATABASE.items():
        rendered = " · ".join(f"{term} ({_BREADTH_TAG[breadth]})" for term, breadth in entries)
        lines.append(f"{category}: {rendered}")
    return "\n".join(lines)


KINK_VOCABULARY_TEXT = render_vocabulary()
