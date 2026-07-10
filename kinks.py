"""Kink / fetish vocabulary database.

This is a curated menu the card generator draws sexuality tags FROM, instead of
free-associating (which collapses to the same handful of tropes every time —
praise kink, edging, bondage, brat taming...).

It lives in the GENERATION prompt only, so it costs tokens once per card
generation and adds NOTHING to the card's own length — the finished card carries
only the 4–6 tags the model selected.

Two tiers:
  DATABASE        — always available to draw from.
  GATED_DATABASE  — darker categories the generator may use ONLY when the user
                    has explicitly established that content in the conversation.

Edit the lists freely; render_vocabulary() rebuilds the injected text from them.
"""

# ── Always available ────────────────────────────────────────────────────────────
DATABASE = {
    "Sex acts": [
        "anal sex", "blowjobs", "cunnilingus", "deep throating", "double penetration",
        "face fucking", "face sitting", "facials", "fingering (anal/vaginal)",
        "fisting (anal/vaginal)", "handjobs", "intercrural sex", "masturbation",
        "pegging", "rimming", "scissoring", "threesome/multi-partner",
        "toys (dildos/plugs/vibrators)", "vaginal sex", "69ing",
    ],
    "Sex types & settings": [
        "angry sex/hatefucking", "car sex", "casual sex/fuck buddies",
        "distant/distracted sex", "drunk sex", "gentle sex", "mirror sex",
        "phone sex", "public sex", "rough sex", "sex against a wall", "sexting",
        "shower sex", "sleepy sex",
    ],
    "Bodily fluids": [
        "bladder desperation", "blood", "bukkake", "creampie", "cum play", "diapers",
        "drool", "lactation", "felching", "flatulence", "menstrual blood", "scat",
        "snowballing", "spit as lube", "spitting in mouth", "squirting", "sweat",
        "swallowing cum", "swallowing urine", "tears/crying", "watersports", "vomit",
    ],
    "Body & modification": [
        "anal gaping", "anal prolapse", "armpits", "belly/throat bulge", "body hair",
        "body worship (ass/breasts/cock)", "enemas", "feeding/stuffing", "feet/footjob",
        "fingers in mouth", "hair pulling", "hickies", "inflation", "nipple play",
        "piercings (body/facial/genital)", "pregnancy (female/male)", "scars", "shaving",
        "tattoos", "titty fucking", "weight gain",
    ],
    "Clothing & cosplay": [
        "boot licking", "boot stepping", "clothed sex", "corsets", "costumes/cosplay",
        "crossdressing", "formal wear", "gloves", "high heels", "jewelry", "latex",
        "leather", "lingerie", "makeup", "military uniforms", "slutty clothes",
        "sock sniffing", "socks", "shoes", "underwear/panties",
    ],
    "BDSM & power dynamics": [
        "aftercare", "anal hooks", "bathroom permission", "begging", "blindfolds",
        "bondage (light/heavy)", "brat taming", "breathplay", "cages", "chastity devices",
        "cock rings", "cockwarming", "collaring (private/public)",
        "consensual non-consent (CNC)", "daddy kink", "discipline", "dom (male/female)",
        "edging", "electric stimulation", "forced orgasms", "free use", "fucking machine",
        "gags (ball/ring/phallic/tape/medical)", "hand feeding", "handcuffs", "harem",
        "harnesses", "hoods", "human furniture", "humiliation (private/public)", "kneeling",
        "leashes", "master/slave", "masks/muzzles", "mommy kink", "orgasm denial",
        "pet play", "punishment",
        "roleplay (adult baby/ageplay/animal/hunter-prey/medical/teacher-student)",
        "role reversal", "sadism/masochism", "safewords", "sensory play",
        "sensory deprivation", "shibari/rope art", "slave/pet training", "sounding",
        "spreader bar", "straightjackets", "sub (male/female)", "suspension", "tickling",
        "traffic light system",
    ],
    "Pain & sensation": [
        "biting", "branding", "bruises", "burns", "caning", "choking",
        "cock & ball torture (CBT)", "fear", "figging", "knife play", "needles",
        "nipple clamps", "pain (moderate/extreme)", "painful sex", "riding crops",
        "scratching", "slapping (face/genitals)", "spanking", "waxplay", "whipping",
        "wounds (minor/major)",
    ],
    "Dynamics & misc": [
        "age difference", "aphrodisiacs", "barebacking", "breeding/impregnation",
        "claiming/marking", "competence kink", "coming in pants", "coming untouched",
        "coming on command", "consensual somnophilia", "cuddling", "degradation",
        "dirty talk", "erotic dancing", "first time", "food play", "frottage/grinding",
        "glory hole", "jealousy", "lapdances", "licking", "massages", "multiple orgasms",
        "object insertion", "objectification (male/female)", "olfactophilia (scent kink)",
        "open relationships", "oral fixation", "overstimulation", "pet names",
        "praise kink", "promiscuity", "size difference", "smoking", "spitroasting",
        "stripping", "sugar daddy", "teasing", "voyeurism",
    ],
}

# ── Gated — only if the user explicitly establishes this content ────────────────
GATED_DATABASE = {
    "Taboo & fantastical (only if the setting/user establishes it)": [
        "bestiality", "furry", "incest", "infidelity/cheating", "monsterfucking",
        "oviposition", "tentacles", "xenophilia", "drug use", "gunplay",
    ],
    "Dub-con / non-con (only if explicitly established)": [
        "coercion/blackmail", "conditioning", "dehumanization", "drugging",
        "fuck or die", "gaslighting", "grooming/manipulation", "hypnotism",
        "mind break", "mind control", "mutual non-con", "non-con touching",
        "non-con somnophilia", "power imbalance", "sex pollen", "stockholm syndrome",
    ],
    "Extreme (only if explicitly established)": [
        "amputation", "bloodplay", "body horror", "cannibalism", "electrocution",
        "eye trauma", "fire play", "flaying/skinning", "gore", "interrogation",
        "mental torture", "necrophilia", "nullification/castration", "self-harm",
        "snuff/murder kink", "vore", "waterboarding", "woundfucking",
    ],
    "Extreme non-con (only if explicitly established)": [
        "abuse (emotional/physical/verbal)", "brainwashing", "domestic violence",
        "forced pregnancy/servitude/crossdressing/infantilism", "gang rape",
        "kidnapping/abduction", "rape scenarios (male/female victim and rapist)",
        "stuck & fucked",
    ],
}


def render_vocabulary() -> str:
    """Render the database into the text block injected into the generation prompt."""
    lines = ["KINK DATABASE — select from these; do not free-associate your own."]
    lines.append("")
    for category, terms in DATABASE.items():
        lines.append(f"{category}: " + " · ".join(terms))
    lines.append("")
    lines.append(
        "GATED — use ONLY if the user explicitly established this kind of content in "
        "the conversation; never introduce it on your own:"
    )
    for category, terms in GATED_DATABASE.items():
        lines.append(f"{category}: " + " · ".join(terms))
    return "\n".join(lines)


KINK_VOCABULARY_TEXT = render_vocabulary()
