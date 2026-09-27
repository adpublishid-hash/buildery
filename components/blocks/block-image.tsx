import type { CSSProperties } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /**
   * Lebar tampil sebenarnya, dipakai browser untuk memilih dari srcset.
   *
   * Wajib, bukan opsional. Default "100vw" pernah ada di sini dan artinya
   * setiap avatar 40px serta logo 20px ikut mengunduh varian 1080w — lebih
   * berat daripada gambar aslinya. Mewajibkannya membuat blok baru tidak bisa
   * jatuh ke jebakan yang sama tanpa disadari.
   */
  sizes: string;
  /** Gambar utama di atas lipatan — dimuat lebih dulu, bukan malas. */
  priority?: boolean;
  width?: number;
  height?: number;
  style?: CSSProperties;
};

/**
 * Lebar yang ditawarkan ke browser.
 *
 * Setiap nilai harus ada di `imageSizes` atau `deviceSizes` bawaan Next —
 * pengoptimal menolak lebar di luar daftar itu dengan HTTP 400. Nilai kecil
 * ada supaya avatar dan logo benar-benar mendapat berkas kecil, bukan
 * terpaksa mengambil kandidat terkecil yang masih 384px.
 */
const WIDTHS = [64, 96, 128, 256, 384, 640, 828, 1080, 1200, 1920] as const;

const QUALITY = 75;

/** Berkas yang kita simpan sendiri, aman dilewatkan ke pengoptimal Next. */
function isLocalUpload(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//");
}

function optimizedUrl(src: string, width: number): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${QUALITY}`;
}

/**
 * Gambar di dalam blok halaman publik.
 *
 * Blok dulu memakai `<img>` mentah, jadi foto 3 MB dari HP pelanggan dikirim
 * apa adanya ke setiap pengunjung. Untuk produk yang intinya adalah landing
 * page, itu langsung terasa di LCP.
 *
 * Sengaja tetap `<img>` dan bukan `next/image`: komponen itu membungkus
 * gambarnya sendiri dan `fill` menuntut induk yang ber-`position`, jadi
 * menukarnya di puluhan blok berarti mengubah tata letak yang sudah jadi.
 * Dengan menunjuk `srcset` ke pengoptimal Next, DOM-nya tetap sama persis
 * sementara yang terkirim sudah diperkecil dan dikonversi ke WebP/AVIF.
 *
 * URL eksternal tidak dioptimasi. Pengguna boleh menempel alamat gambar mana
 * pun, dan meneruskan alamat sembarang ke pengoptimal berarti server kita
 * mengambil URL yang ditentukan orang lain.
 */
export function BlockImage({
  src,
  alt,
  className,
  sizes,
  priority = false,
  width,
  height,
  style,
}: Props) {
  if (!src) return null;

  const local = isLocalUpload(src);
  const srcSet = local
    ? WIDTHS.map((w) => `${optimizedUrl(src, w)} ${w}w`).join(", ")
    : undefined;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={local ? optimizedUrl(src, 1080) : src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      width={width}
      height={height}
      style={style}
    />
  );
}
