import {
  DietaryTag as DT,
  FoodCategory as FC,
  FoodUnit as FU,
  type PrismaClient,
} from "../src/generated/prisma/client.js";

interface FoodSeed {
  name: string;
  nameAr: string;
  slug: string;
  category: FC;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  defaultUnit: FU;
  defaultServingGrams: number | null;
  estimatedPriceIqdPerKg: number | null;
  dietaryTags: DT[];
  allergenTags: string[];
  isIraqiCommon: boolean;
}

const meatTags = [DT.HALAL, DT.GLUTEN_FREE, DT.DAIRY_FREE];
const vegetarianTags = [DT.HALAL, DT.VEGETARIAN, DT.GLUTEN_FREE];
const eggTags = [DT.HALAL, DT.VEGETARIAN, DT.GLUTEN_FREE, DT.DAIRY_FREE];
const plantTags = (glutenFree = true): DT[] => [
  DT.HALAL,
  DT.VEGETARIAN,
  DT.VEGAN,
  DT.DAIRY_FREE,
  ...(glutenFree ? [DT.GLUTEN_FREE] : []),
];

function food(
  name: string,
  nameAr: string,
  slug: string,
  category: FC,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number | null,
  price: number | null,
  isIraqiCommon: boolean,
  dietaryTags: DT[],
  allergenTags: string[] = [],
  defaultServingGrams: number | null = 100,
  defaultUnit: FU = FU.GRAM,
): FoodSeed {
  return {
    name,
    nameAr,
    slug,
    category,
    caloriesPer100g: calories,
    proteinPer100g: protein,
    carbsPer100g: carbs,
    fatPer100g: fat,
    fiberPer100g: fiber,
    defaultUnit,
    defaultServingGrams,
    estimatedPriceIqdPerKg: price,
    dietaryTags,
    allergenTags,
    isIraqiCommon,
  };
}

export const foodSeeds: FoodSeed[] = [
  food("Chicken Breast, Cooked", "صدر دجاج مطبوخ", "chicken-breast", FC.PROTEIN, 165, 31, 0, 3.6, 0, 8_000, true, meatTags),
  food("Chicken Thigh, Cooked", "فخذ دجاج مطبوخ", "chicken-thigh", FC.PROTEIN, 209, 26, 0, 10.9, 0, 6_500, true, meatTags),
  food("Lean Beef, Cooked", "لحم بقري قليل الدهن", "lean-beef", FC.PROTEIN, 217, 26.1, 0, 11.8, 0, 16_000, true, meatTags),
  food("Lean Ground Beef, Cooked", "لحم مفروم قليل الدهن", "lean-ground-beef", FC.PROTEIN, 215, 26, 0, 11, 0, 14_000, true, meatTags),
  food("Tuna, Canned in Water", "تونة بالماء", "tuna-canned-water", FC.PROTEIN, 116, 25.5, 0, 0.8, 0, 12_000, true, meatTags, ["fish"]),
  food("White Fish, Cooked", "سمك أبيض مطبوخ", "white-fish", FC.PROTEIN, 128, 26, 0, 2.7, 0, 11_000, true, meatTags, ["fish"]),
  food("Salmon, Cooked", "سلمون مطبوخ", "salmon", FC.PROTEIN, 208, 22, 0, 12, 0, 28_000, false, meatTags, ["fish"]),
  food("Whole Eggs", "بيض كامل", "whole-eggs", FC.PROTEIN, 143, 12.6, 0.7, 9.5, 0, 5_500, true, eggTags, ["egg"], 50, FU.PIECE),
  food("Egg Whites", "بياض البيض", "egg-whites", FC.PROTEIN, 52, 10.9, 0.7, 0.2, 0, 6_000, true, eggTags, ["egg"], 33, FU.PIECE),
  food("Turkey Breast, Cooked", "صدر حبش مطبوخ", "turkey-breast", FC.PROTEIN, 135, 29, 0, 1.6, 0, 14_000, false, meatTags),
  food("Greek Yogurt, Low Fat", "روب يوناني قليل الدهن", "greek-yogurt-low-fat", FC.DAIRY, 73, 10, 3.9, 2, 0, 7_000, false, vegetarianTags, ["milk"], 200),
  food("Yogurt, Low Fat", "روب قليل الدهن", "yogurt-low-fat", FC.DAIRY, 63, 5.3, 7, 1.6, 0, 3_000, true, vegetarianTags, ["milk"], 200),
  food("Cottage Cheese, Low Fat", "جبن قريش قليل الدهن", "cottage-cheese-low-fat", FC.DAIRY, 82, 11.1, 3.4, 2.3, 0, 8_000, false, vegetarianTags, ["milk"], 150),
  food("Whey Protein Powder", "مسحوق بروتين مصل الحليب", "whey-protein", FC.PROTEIN, 400, 80, 8, 6, 0, 38_000, false, vegetarianTags, ["milk"], 30),
  food("Firm Tofu", "توفو", "tofu-firm", FC.PROTEIN, 144, 17.3, 2.8, 8.7, 2.3, 10_000, false, plantTags(), ["soy"], 150),
  food("Textured Vegetable Protein, Dry", "بروتين الصويا المجفف", "textured-vegetable-protein-dry", FC.PROTEIN, 327, 50, 33, 1.2, 17, 9_000, false, plantTags(), ["soy"], 60),

  food("Cooked White Rice", "تمن أبيض مطبوخ", "cooked-white-rice", FC.CARBOHYDRATE, 130, 2.7, 28.2, 0.3, 0.4, 2_500, true, plantTags()),
  food("Basmati Rice, Cooked", "تمن بسمتي مطبوخ", "basmati-rice-cooked", FC.CARBOHYDRATE, 121, 3.5, 25.2, 0.4, 0.4, 3_000, true, plantTags()),
  food("Iraqi Flatbread", "خبز عراقي", "iraqi-khubz", FC.CARBOHYDRATE, 275, 9, 55, 2, 3, 2_000, true, plantTags(false), ["gluten"], 100),
  food("Samoon Bread", "صمون", "samoon", FC.CARBOHYDRATE, 270, 8.5, 52, 3, 2.5, 2_500, true, plantTags(false), ["gluten"], 90, FU.PIECE),
  food("Bulgur, Cooked", "برغل مطبوخ", "bulgur-cooked", FC.CARBOHYDRATE, 83, 3.1, 18.6, 0.2, 4.5, 2_500, true, plantTags(false), ["gluten"]),
  food("Lentils, Cooked", "عدس مطبوخ", "lentils-cooked", FC.LEGUME, 116, 9, 20.1, 0.4, 7.9, 3_000, true, plantTags()),
  food("Chickpeas, Cooked", "حمص حب مطبوخ", "chickpeas-cooked", FC.LEGUME, 164, 8.9, 27.4, 2.6, 7.6, 4_000, true, plantTags()),
  food("Kidney Beans, Cooked", "فاصوليا حمراء مطبوخة", "kidney-beans-cooked", FC.LEGUME, 127, 8.7, 22.8, 0.5, 6.4, 4_000, true, plantTags()),
  food("Fava Beans, Cooked", "باقلاء مطبوخة", "fava-beans-cooked", FC.LEGUME, 110, 7.6, 19.7, 0.4, 5.4, 3_000, true, plantTags()),
  food("Potatoes, Boiled", "بطاطا مسلوقة", "potatoes-boiled", FC.CARBOHYDRATE, 87, 1.9, 20.1, 0.1, 1.8, 1_500, true, plantTags()),
  food("Sweet Potatoes, Cooked", "بطاطا حلوة مطبوخة", "sweet-potatoes-cooked", FC.CARBOHYDRATE, 90, 2, 20.7, 0.2, 3.3, 3_500, false, plantTags()),
  food("Oats, Dry", "شوفان جاف", "oats-dry", FC.CARBOHYDRATE, 379, 13.2, 67.7, 6.5, 10.1, 4_500, true, plantTags(false), ["gluten"], 50),
  food("Pasta, Cooked", "معكرونة مطبوخة", "pasta-cooked", FC.CARBOHYDRATE, 158, 5.8, 30.9, 0.9, 1.8, 3_000, true, plantTags(false), ["gluten"]),
  food("Whole Wheat Bread", "خبز حنطة كاملة", "whole-wheat-bread", FC.CARBOHYDRATE, 247, 13, 41, 4.2, 7, 3_500, false, plantTags(false), ["gluten"], 35),
  food("Corn, Cooked", "ذرة مطبوخة", "corn-cooked", FC.CARBOHYDRATE, 96, 3.4, 21, 1.5, 2.4, 3_500, true, plantTags()),
  food("Green Peas, Cooked", "بازلاء مطبوخة", "green-peas-cooked", FC.LEGUME, 84, 5.4, 15.6, 0.2, 5.5, 4_000, true, plantTags()),
  food("Quinoa, Cooked", "كينوا مطبوخة", "quinoa-cooked", FC.CARBOHYDRATE, 120, 4.4, 21.3, 1.9, 2.8, 10_000, false, plantTags()),
  food("Rice Cakes", "كعك الأرز", "rice-cakes", FC.CARBOHYDRATE, 387, 8, 81, 2.8, 3.5, 12_000, false, plantTags(), [], 9, FU.PIECE),
  food("Barley, Cooked", "شعير مطبوخ", "barley-cooked", FC.CARBOHYDRATE, 123, 2.3, 28.2, 0.4, 3.8, 3_000, true, plantTags(false), ["gluten"]),
  food("Couscous, Cooked", "كسكس مطبوخ", "couscous-cooked", FC.CARBOHYDRATE, 112, 3.8, 23.2, 0.2, 1.4, 5_000, false, plantTags(false), ["gluten"]),

  food("Dates", "تمر", "dates", FC.FRUIT, 282, 2.5, 75, 0.4, 8, 5_000, true, plantTags(), [], 24, FU.PIECE),
  food("Banana", "موز", "banana", FC.FRUIT, 89, 1.1, 22.8, 0.3, 2.6, 2_500, true, plantTags(), [], 118, FU.PIECE),
  food("Apple", "تفاح", "apple", FC.FRUIT, 52, 0.3, 13.8, 0.2, 2.4, 3_000, true, plantTags(), [], 180, FU.PIECE),
  food("Orange", "برتقال", "orange", FC.FRUIT, 47, 0.9, 11.8, 0.1, 2.4, 2_500, true, plantTags(), [], 140, FU.PIECE),
  food("Tomato", "طماطة", "tomato", FC.VEGETABLE, 18, 0.9, 3.9, 0.2, 1.2, 1_500, true, plantTags()),
  food("Cucumber", "خيار", "cucumber", FC.VEGETABLE, 15, 0.7, 3.6, 0.1, 0.5, 1_500, true, plantTags()),
  food("Lettuce", "خس", "lettuce", FC.VEGETABLE, 15, 1.4, 2.9, 0.2, 1.3, 2_000, true, plantTags()),
  food("Onion", "بصل", "onion", FC.VEGETABLE, 40, 1.1, 9.3, 0.1, 1.7, 1_000, true, plantTags()),
  food("Carrots", "جزر", "carrots", FC.VEGETABLE, 41, 0.9, 9.6, 0.2, 2.8, 1_500, true, plantTags()),
  food("Bell Pepper", "فلفل حلو", "bell-pepper", FC.VEGETABLE, 31, 1, 6, 0.3, 2.1, 3_000, true, plantTags()),
  food("Spinach", "سبانخ", "spinach", FC.VEGETABLE, 23, 2.9, 3.6, 0.4, 2.2, 3_000, true, plantTags()),
  food("Broccoli", "بروكلي", "broccoli", FC.VEGETABLE, 35, 2.4, 7.2, 0.4, 3.3, 5_000, false, plantTags()),
  food("Cauliflower", "قرنابيط", "cauliflower", FC.VEGETABLE, 25, 1.9, 5, 0.3, 2, 2_500, true, plantTags()),
  food("Zucchini", "شجر", "zucchini", FC.VEGETABLE, 17, 1.2, 3.1, 0.3, 1, 2_000, true, plantTags()),
  food("Eggplant", "باذنجان", "eggplant", FC.VEGETABLE, 25, 1, 6, 0.2, 3, 1_500, true, plantTags()),
  food("Grapes", "عنب", "grapes", FC.FRUIT, 69, 0.7, 18.1, 0.2, 0.9, 4_000, true, plantTags()),
  food("Pomegranate", "رمان", "pomegranate", FC.FRUIT, 83, 1.7, 18.7, 1.2, 4, 4_000, true, plantTags()),
  food("Watermelon", "رقي", "watermelon", FC.FRUIT, 30, 0.6, 7.6, 0.2, 0.4, 1_500, true, plantTags()),

  food("Tahini", "طحينية", "tahini", FC.FAT, 595, 17, 21, 53.8, 9.3, 8_000, true, plantTags(), ["sesame"], 20),
  food("Hummus", "حمص بطحينية", "hummus", FC.MIXED_MEAL, 166, 7.9, 14.3, 9.6, 6, 5_000, true, plantTags(), ["sesame"], 100),
  food("Labneh", "لبنة", "labneh", FC.DAIRY, 150, 9, 6, 10, 0, 5_000, true, vegetarianTags, ["milk"], 100),
  food("Low-Fat Milk", "حليب قليل الدسم", "milk-low-fat", FC.DAIRY, 42, 3.4, 5, 1, 0, 2_000, true, vegetarianTags, ["milk"], 250, FU.MILLILITER),
  food("Peanut Butter", "زبدة الفول السوداني", "peanut-butter", FC.FAT, 588, 25, 20, 50, 6, 9_000, false, plantTags(), ["peanut"], 20),
  food("Almonds", "لوز", "almonds", FC.FAT, 579, 21.2, 21.6, 49.9, 12.5, 18_000, true, plantTags(), ["tree_nut"], 30),
  food("Walnuts", "جوز", "walnuts", FC.FAT, 654, 15.2, 13.7, 65.2, 6.7, 18_000, true, plantTags(), ["tree_nut"], 30),
  food("Olive Oil", "زيت زيتون", "olive-oil", FC.FAT, 884, 0, 0, 100, 0, 10_000, true, plantTags(), [], 14),
  food("Avocado", "أفوكادو", "avocado", FC.FAT, 160, 2, 8.5, 14.7, 6.7, 10_000, false, plantTags(), [], 100),
  food("Low-Fat White Cheese", "جبن أبيض قليل الدهن", "white-cheese-low-fat", FC.DAIRY, 180, 20, 4, 9, 0, 8_000, true, vegetarianTags, ["milk"], 50),
  food("Black Olives", "زيتون أسود", "black-olives", FC.FAT, 116, 0.8, 6, 10.9, 1.6, 6_000, true, plantTags(), [], 30),
  food("Sesame Seeds", "سمسم", "sesame-seeds", FC.FAT, 573, 17.7, 23.4, 49.7, 11.8, 9_000, true, plantTags(), ["sesame"], 15),
];

interface FoodSubstitutionSeed {
  food: string;
  substitute: string;
  priority: number;
  reason: string;
}

export const foodSubstitutionSeeds: FoodSubstitutionSeed[] = [
  { food: "chicken-breast", substitute: "turkey-breast", priority: 1, reason: "Lean poultry protein alternative" },
  { food: "chicken-breast", substitute: "tuna-canned-water", priority: 2, reason: "Lean protein alternative" },
  { food: "chicken-breast", substitute: "lean-beef", priority: 3, reason: "Red meat protein alternative" },
  { food: "chicken-breast", substitute: "whole-eggs", priority: 4, reason: "Common protein alternative" },
  { food: "lean-beef", substitute: "chicken-breast", priority: 1, reason: "Lower-fat protein alternative" },
  { food: "lean-beef", substitute: "lean-ground-beef", priority: 2, reason: "Similar beef option" },
  { food: "tuna-canned-water", substitute: "white-fish", priority: 1, reason: "Similar lean fish protein" },
  { food: "tuna-canned-water", substitute: "chicken-breast", priority: 2, reason: "Lean non-fish protein" },
  { food: "whole-eggs", substitute: "egg-whites", priority: 1, reason: "Higher protein-to-fat egg option" },
  { food: "whole-eggs", substitute: "greek-yogurt-low-fat", priority: 2, reason: "Vegetarian protein option" },
  { food: "cooked-white-rice", substitute: "potatoes-boiled", priority: 1, reason: "Common carbohydrate alternative" },
  { food: "cooked-white-rice", substitute: "basmati-rice-cooked", priority: 2, reason: "Similar cooked rice" },
  { food: "cooked-white-rice", substitute: "bulgur-cooked", priority: 3, reason: "Whole-grain carbohydrate alternative" },
  { food: "cooked-white-rice", substitute: "pasta-cooked", priority: 4, reason: "Cooked carbohydrate alternative" },
  { food: "cooked-white-rice", substitute: "iraqi-khubz", priority: 5, reason: "Common Iraqi carbohydrate option" },
  { food: "potatoes-boiled", substitute: "cooked-white-rice", priority: 1, reason: "Common carbohydrate alternative" },
  { food: "potatoes-boiled", substitute: "sweet-potatoes-cooked", priority: 2, reason: "Similar starchy vegetable" },
  { food: "iraqi-khubz", substitute: "cooked-white-rice", priority: 1, reason: "Gluten-free carbohydrate option" },
  { food: "iraqi-khubz", substitute: "potatoes-boiled", priority: 2, reason: "Gluten-free starchy option" },
  { food: "greek-yogurt-low-fat", substitute: "yogurt-low-fat", priority: 1, reason: "Common lower-cost yogurt" },
  { food: "greek-yogurt-low-fat", substitute: "labneh", priority: 2, reason: "Common cultured dairy option" },
  { food: "yogurt-low-fat", substitute: "greek-yogurt-low-fat", priority: 1, reason: "Higher-protein yogurt" },
  { food: "tahini", substitute: "peanut-butter", priority: 1, reason: "Spreadable fat alternative" },
  { food: "tahini", substitute: "olive-oil", priority: 2, reason: "Common added-fat alternative" },
  { food: "olive-oil", substitute: "tahini", priority: 1, reason: "Sesame-based fat alternative" },
  { food: "almonds", substitute: "walnuts", priority: 1, reason: "Tree-nut fat alternative" },
  { food: "banana", substitute: "apple", priority: 1, reason: "Common fruit alternative" },
  { food: "banana", substitute: "orange", priority: 2, reason: "Common fruit alternative" },
  { food: "lentils-cooked", substitute: "chickpeas-cooked", priority: 1, reason: "Legume alternative" },
  { food: "lentils-cooked", substitute: "fava-beans-cooked", priority: 2, reason: "Common Iraqi legume" },
];

export async function seedFoods(prisma: PrismaClient): Promise<{
  foodCount: number;
  iraqiCommonCount: number;
  substitutionCount: number;
}> {
  const ids = new Map<string, string>();
  for (const item of foodSeeds) {
    const saved = await prisma.food.upsert({
      where: { slug: item.slug },
      update: { ...item, isActive: true },
      create: item,
      select: { id: true },
    });
    ids.set(item.slug, saved.id);
  }
  for (const item of foodSubstitutionSeeds) {
    const foodId = ids.get(item.food);
    const substituteFoodId = ids.get(item.substitute);
    if (!foodId || !substituteFoodId) {
      throw new Error(`Missing food substitution: ${item.food} -> ${item.substitute}`);
    }
    await prisma.foodSubstitution.upsert({
      where: { foodId_substituteFoodId: { foodId, substituteFoodId } },
      update: { priority: item.priority, reason: item.reason },
      create: { foodId, substituteFoodId, priority: item.priority, reason: item.reason },
    });
  }
  return {
    foodCount: foodSeeds.length,
    iraqiCommonCount: foodSeeds.filter((item) => item.isIraqiCommon).length,
    substitutionCount: foodSubstitutionSeeds.length,
  };
}
