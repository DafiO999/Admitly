// The Atlas photography is decorative. It is not presented as a photo of a specific school.
const atlasPhotos = [
  "1562774053-701939374585",
  "1498243691581-b145c3f54a5a",
  "1541339907198-e08756dedf3f",
];

export function universityImage(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `https://images.unsplash.com/photo-${atlasPhotos[hash % atlasPhotos.length]}?auto=format&fit=crop&w=1200&q=80`;
}
