-- title: Ingredient-level exposure to wasted dishes
-- concepts: many-to-many join through dish_ingredient, GROUP BY, HAVING COUNT(DISTINCT), case-insensitive name join
-- purpose: Which raw ingredients sit behind the most wasted dishes? A dish is a recipe (M:N with ingredients); joining wasted dish-foods to their recipes shows which staples (rice, oil, onions) a procurement team should look at first.
-- mode: select
-- reading: Ingredients ordered by the wasted kilograms of the dishes they go into; wasted_dishes_using_it is how many distinct wasted dishes contain the ingredient.
SELECT ing.canonical_name                              AS ingredient,
       COUNT(DISTINCT d.dish_name)                     AS wasted_dishes_using_it,
       ROUND(SUM(w.quantity_kg))                       AS wasted_kg_of_those_dishes,
       ROUND(AVG(di.qty_per_portion)::numeric, 3)      AS avg_qty_per_portion
  FROM waste_event w
  JOIN waste_reason wr    ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN food_item dish_food ON dish_food.food_id = w.food_id
  JOIN dish d             ON lower(d.dish_name) = lower(dish_food.canonical_name)
                         AND d.establishment_id = w.establishment_id
  JOIN dish_ingredient di ON di.dish_id = d.dish_id
  JOIN food_item ing      ON ing.food_id = di.food_id
 WHERE w.occurred_on >= CURRENT_DATE - 90
 GROUP BY ing.food_id, ing.canonical_name
HAVING COUNT(DISTINCT d.dish_name) >= 3
 ORDER BY wasted_kg_of_those_dishes DESC
 LIMIT 12;
