/* eslint-disable @next/next/no-img-element */

/**
 * Logo de LOOP REPUESTOS.
 *
 * Usa el logo oficial en `public/logo-loop.png` (versión circular). Para una
 * versión horizontal/simplificada a futuro, dejá `public/logo-loop-horizontal.svg`
 * y actualizá `LOGO_SRC`. El archivo oficial no debe redibujarse ni alterarse.
 *
 * `variant="mark"` renderiza sólo el ícono circular; el header lo acompaña con
 * el wordmark textual, de modo que cambiar a una versión horizontal más
 * adelante sea un cambio localizado.
 */
const LOGO_SRC = "/logo-loop.png"; // logo oficial (circular)

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src={LOGO_SRC}
      alt="LOOP REPUESTOS"
      width={size}
      height={size}
      className="rounded-full ring-1 ring-borde"
      style={{ width: size, height: size }}
    />
  );
}
