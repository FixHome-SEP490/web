<template>
  <!-- Wide district-scale geometric street & river map backdrop in FixHome cool palette -->
  <svg
    class="pointer-events-none select-none h-full w-full"
    viewBox="0 0 1200 600"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <rect width="1200" height="600" fill="#F3F8FE" />

    <!-- Scattered district parks & green belts -->
    <g fill="#E3F2E7">
      <path d="M90 65 Q 155 48 205 88 L 182 142 Q 118 148 82 110 Z" />
      <rect x="470" y="54" width="110" height="58" rx="16" />
      <path d="M840 72 L 968 56 L 992 130 L 860 144 Z" />
      <rect x="148" y="405" width="124" height="72" rx="18" />
      <path d="M722 410 Q 795 390 835 448 L 798 518 L 712 490 Z" />
      <rect x="1008" y="340" width="118" height="84" rx="22" />
    </g>

    <!-- Subtle urban neighborhood block footprints (gives crisp zoomed-out map scale) -->
    <g fill="#E9F1FB" opacity="0.8">
      <rect x="250" y="88" width="44" height="28" rx="4" />
      <rect x="310" y="92" width="52" height="24" rx="4" />
      <rect x="640" y="82" width="58" height="30" rx="4" />
      <rect x="720" y="86" width="46" height="26" rx="4" />
      <rect x="260" y="196" width="42" height="26" rx="4" />
      <rect x="322" y="198" width="50" height="24" rx="4" />
      <rect x="448" y="180" width="46" height="28" rx="4" />
      <rect x="698" y="192" width="48" height="26" rx="4" />
      <rect x="852" y="210" width="54" height="30" rx="4" />
      <rect x="935" y="205" width="44" height="26" rx="4" />
      <rect x="455" y="370" width="52" height="28" rx="4" />
      <rect x="526" y="372" width="44" height="26" rx="4" />
      <rect x="880" y="458" width="56" height="28" rx="4" />
      <rect x="330" y="456" width="48" height="28" rx="4" />
    </g>

    <!-- Slender city river + side canal -->
    <g fill="none" stroke-linecap="round">
      <path
        d="M-30 140 C 88 92, 212 104, 216 218 C 220 330, 128 395, 215 488 C 305 585, 535 510, 682 448 C 822 388, 975 415, 1230 342"
        stroke="#CFE3FB"
        stroke-width="22"
      />
      <path
        d="M-30 140 C 88 92, 212 104, 216 218 C 220 330, 128 395, 215 488 C 305 585, 535 510, 682 448 C 822 388, 975 415, 1230 342"
        stroke="#DFEEFE"
        stroke-width="12"
      />
      <path
        d="M845 406 C 900 288, 955 215, 1048 135 C 1104 88, 1152 46, 1225 -10"
        stroke="#D4E6FC"
        stroke-width="10"
      />
    </g>

    <!-- Dense secondary neighborhood street grid -->
    <g stroke="#E3ECF7" stroke-width="2" stroke-linecap="round" fill="none">
      <!-- Horizontal / curved neighborhood streets -->
      <line x1="0" y1="48" x2="1200" y2="62" />
      <line x1="0" y1="112" x2="1200" y2="126" />
      <line x1="0" y1="176" x2="1200" y2="162" />
      <line x1="0" y1="234" x2="1200" y2="252" />
      <line x1="0" y1="296" x2="1200" y2="284" />
      <line x1="0" y1="354" x2="1200" y2="372" />
      <line x1="0" y1="422" x2="1200" y2="404" />
      <line x1="0" y1="486" x2="1200" y2="508" />
      <line x1="0" y1="552" x2="1200" y2="540" />

      <!-- Vertical / slightly angled neighborhood streets -->
      <line x1="84" y1="0" x2="66" y2="600" />
      <line x1="170" y1="0" x2="152" y2="600" />
      <line x1="242" y1="0" x2="262" y2="600" />
      <line x1="316" y1="0" x2="302" y2="600" />
      <line x1="396" y1="0" x2="414" y2="600" />
      <line x1="472" y1="0" x2="458" y2="600" />
      <line x1="552" y1="0" x2="536" y2="600" />
      <line x1="636" y1="0" x2="652" y2="600" />
      <line x1="714" y1="0" x2="696" y2="600" />
      <line x1="798" y1="0" x2="818" y2="600" />
      <line x1="876" y1="0" x2="858" y2="600" />
      <line x1="962" y1="0" x2="982" y2="600" />
      <line x1="1048" y1="0" x2="1032" y2="600" />
      <line x1="1128" y1="0" x2="1146" y2="600" />

      <!-- Diagonal connectors -->
      <path d="M190 0 L 495 310 L 760 600" />
      <path d="M890 0 L 660 280 L 420 600" />
    </g>

    <!-- Primary arterial avenues + roundabouts -->
    <g stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-20 264 Q 310 240 600 296 T 1220 256" />
      <path d="M-20 436 Q 340 456 640 368 T 1220 442" />
      <path d="M352 -10 L 600 296 L 718 610" />
      <path d="M778 -10 L 600 296 L 390 610" />
      <circle cx="600" cy="296" r="14" fill="#F3F8FE" />
      <circle cx="386" cy="252" r="10" fill="#F3F8FE" />
      <circle cx="842" cy="404" r="11" fill="#F3F8FE" />
    </g>

    <!-- Subtle ring highway -->
    <path
      d="M112 -10 C 166 196, 128 408, 178 610"
      fill="none"
      stroke="#F7E4A6"
      stroke-width="3.5"
      stroke-linecap="round"
      opacity="0.7"
    />
    <path
      d="M-20 96 C 360 128, 820 128, 1220 82"
      fill="none"
      stroke="#F7E4A6"
      stroke-width="3"
      stroke-linecap="round"
      opacity="0.6"
    />
  </svg>
</template>
