# Weather category reference

The resolver starts with the exact condition and moves only toward visually
safer, broader fallbacks.

Examples:

- Lightning: lightning -> thunderstorm -> heavy-rain -> rain -> overcast
  -> cloudy -> partly-cloudy -> fair -> default
- Rain: rain -> drizzle -> overcast -> cloudy -> partly-cloudy -> fair
  -> default
- Fog: fog -> haze -> overcast -> cloudy -> fair -> default
- Snow: snow -> overcast -> cloudy -> partly-cloudy -> fair -> default
- Fair: fair -> partly-cloudy -> cloudy -> default

A missing rain image never escalates into lightning.

Times:

    day-01.webp
    dusk-01.webp
    night-01.webp
    default-01.webp

Priority:

    01 primary
    02 first fallback
    03 next fallback
