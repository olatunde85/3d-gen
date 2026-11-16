declare module 'virtual:ara-catalog' {
  const catalog: {
    presets: string[];
    animations: { id: string; name: string; group: string; category: string; loop: boolean }[];
    props: { weapons: string[]; carried: string[]; vehicles: string[] };
    expressions: Record<string, Record<string, number>>;
    faceShapes: string[];
  };
  export default catalog;
}
