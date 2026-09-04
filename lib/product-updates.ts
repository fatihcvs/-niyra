import updates from "./product-updates.json";

export type ProductUpdateCategory = "Yeni özellik" | "İyileştirme" | "Düzeltme" | "İçerik";

export type ProductUpdate = {
  id: string;
  releasedAt: string;
  category: ProductUpdateCategory;
  area: string;
  title: string;
  summary: string;
  highlights: string[];
};

export const PRODUCT_UPDATES = updates as ProductUpdate[];
