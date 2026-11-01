"""Static catalogue for the synthetic ZoneFood seed.

EVERYTHING here is invented demo data: establishment, supplier, NGO and person names are
fictional and do not describe any real business, institution or locality.
"""
from __future__ import annotations

# --- food items: (canonical_name, category, base_unit, avg_cost_per_unit INR, edible_as_is, description)
RAW_FOODS = [
    ("Basmati Rice", "Cereals & Grains", "kg", 95, False, "long grain aromatic rice"),
    ("Sona Masoori Rice", "Cereals & Grains", "kg", 62, False, "medium grain everyday rice"),
    ("Wheat Flour (Atta)", "Cereals & Grains", "kg", 42, False, "whole wheat flour for chapati"),
    ("Semolina (Rava)", "Cereals & Grains", "kg", 48, False, "coarse wheat semolina"),
    ("Rice Flour", "Cereals & Grains", "kg", 55, False, "ground rice for batters"),
    ("Poha (Flattened Rice)", "Cereals & Grains", "kg", 60, False, "flattened rice flakes"),
    ("Pasta", "Packaged & Processed", "kg", 130, False, "dried durum wheat pasta"),
    ("Instant Noodles", "Packaged & Processed", "kg", 110, True, "packaged wheat noodles"),
    ("Toor Dal", "Pulses & Legumes", "kg", 140, False, "split pigeon peas"),
    ("Moong Dal", "Pulses & Legumes", "kg", 125, False, "split green gram"),
    ("Urad Dal", "Pulses & Legumes", "kg", 135, False, "split black gram"),
    ("Chickpeas (Chole)", "Pulses & Legumes", "kg", 120, False, "dried white chickpeas"),
    ("Rajma (Kidney Beans)", "Pulses & Legumes", "kg", 150, False, "dried red kidney beans"),
    ("Onion", "Vegetables", "kg", 35, True, "fresh onion"),
    ("Tomato", "Vegetables", "kg", 40, True, "fresh tomato"),
    ("Potato", "Vegetables", "kg", 30, True, "fresh potato"),
    ("Cauliflower", "Vegetables", "kg", 45, True, "fresh cauliflower"),
    ("Green Peas", "Vegetables", "kg", 90, True, "shelled green peas"),
    ("Carrot", "Vegetables", "kg", 48, True, "fresh carrot"),
    ("Capsicum", "Vegetables", "kg", 70, True, "fresh bell pepper"),
    ("Spinach (Palak)", "Vegetables", "kg", 40, True, "leafy spinach"),
    ("Cabbage", "Vegetables", "kg", 28, True, "fresh cabbage"),
    ("Brinjal (Eggplant)", "Vegetables", "kg", 50, True, "fresh brinjal"),
    ("Green Beans", "Vegetables", "kg", 60, True, "fresh french beans"),
    ("Banana", "Fruits", "kg", 55, True, "ripe banana"),
    ("Seasonal Fruit Mix", "Fruits", "kg", 90, True, "assorted seasonal fruit"),
    ("Milk", "Dairy", "litre", 56, True, "pasteurised toned milk"),
    ("Paneer", "Dairy", "kg", 340, True, "fresh cottage cheese"),
    ("Curd", "Dairy", "kg", 70, True, "set yoghurt"),
    ("Butter", "Dairy", "kg", 520, True, "salted butter"),
    ("Ghee", "Dairy", "kg", 620, True, "clarified butter"),
    ("Cheese", "Dairy", "kg", 450, True, "processed cheese"),
    ("Chicken", "Meat & Poultry", "kg", 220, False, "fresh dressed chicken"),
    ("Mutton", "Meat & Poultry", "kg", 780, False, "fresh goat meat"),
    ("Fish Fillet", "Fish & Seafood", "kg", 420, False, "fresh fish fillet"),
    ("Eggs", "Eggs", "unit", 7, False, "hen eggs, counted per egg"),
    ("Wheat Bread", "Breads & Bakery", "kg", 60, True, "sliced wheat bread"),
    ("Sunflower Oil", "Oils & Condiments", "litre", 140, False, "refined cooking oil"),
    ("Sugar", "Oils & Condiments", "kg", 45, False, "white sugar"),
    ("Salt", "Oils & Condiments", "kg", 20, False, "iodised salt"),
    ("Garam Masala", "Oils & Condiments", "kg", 600, False, "ground spice blend"),
    ("Tea Powder", "Oils & Condiments", "kg", 380, False, "CTC tea"),
    ("Packaged Biscuits", "Packaged & Processed", "kg", 120, True, "packaged biscuits"),
    ("Packaged Fruit Juice", "Beverages", "litre", 90, True, "packaged fruit juice"),
    ("Soft Drink", "Beverages", "litre", 60, True, "carbonated soft drink"),
    ("Namkeen Mix", "Snacks & Sweets", "kg", 180, True, "savoury snack mix"),
    ("Sweets (Mithai)", "Snacks & Sweets", "kg", 380, True, "assorted milk sweets"),
]

# --- dishes: name -> (cooked-food category, vegetarian, portion_g, cooked cost INR/kg, ingredients[(raw, kg per portion)])
DISHES = {
    "Veg Biryani": ("Cooked Rice Dishes", True, 350, 150, [("Basmati Rice", .09), ("Onion", .03), ("Carrot", .02), ("Green Peas", .02), ("Ghee", .01), ("Garam Masala", .003)]),
    "Chicken Biryani": ("Cooked Rice Dishes", False, 400, 230, [("Basmati Rice", .10), ("Chicken", .15), ("Onion", .04), ("Ghee", .012), ("Garam Masala", .004)]),
    "Jeera Rice": ("Cooked Rice Dishes", True, 250, 110, [("Basmati Rice", .08), ("Ghee", .008)]),
    "Curd Rice": ("Cooked Rice Dishes", True, 250, 95, [("Sona Masoori Rice", .07), ("Curd", .10)]),
    "Sambar Rice": ("Cooked Rice Dishes", True, 300, 100, [("Sona Masoori Rice", .08), ("Toor Dal", .03), ("Carrot", .02), ("Brinjal (Eggplant)", .02)]),
    "Steamed Rice": ("Cooked Rice Dishes", True, 250, 70, [("Sona Masoori Rice", .09)]),
    "Vegetable Pulao": ("Cooked Rice Dishes", True, 300, 135, [("Basmati Rice", .09), ("Carrot", .02), ("Green Peas", .02), ("Ghee", .008)]),
    "Veg Fried Rice": ("Cooked Rice Dishes", True, 300, 125, [("Sona Masoori Rice", .09), ("Cabbage", .03), ("Carrot", .02), ("Green Beans", .02), ("Sunflower Oil", .01)]),
    "Dal Khichdi": ("Cooked Rice Dishes", True, 300, 90, [("Sona Masoori Rice", .06), ("Moong Dal", .04)]),
    "Dal Tadka": ("Cooked Curries & Gravies", True, 200, 105, [("Toor Dal", .05), ("Onion", .02), ("Tomato", .03), ("Ghee", .005)]),
    "Paneer Butter Masala": ("Cooked Curries & Gravies", True, 180, 280, [("Paneer", .08), ("Tomato", .08), ("Butter", .01), ("Onion", .03)]),
    "Palak Paneer": ("Cooked Curries & Gravies", True, 180, 260, [("Spinach (Palak)", .10), ("Paneer", .06), ("Onion", .02)]),
    "Chole Masala": ("Cooked Curries & Gravies", True, 200, 120, [("Chickpeas (Chole)", .06), ("Onion", .03), ("Tomato", .04)]),
    "Rajma Masala": ("Cooked Curries & Gravies", True, 200, 125, [("Rajma (Kidney Beans)", .06), ("Onion", .03), ("Tomato", .04)]),
    "Mixed Veg Curry": ("Cooked Curries & Gravies", True, 180, 95, [("Potato", .04), ("Carrot", .03), ("Cauliflower", .04), ("Green Peas", .02)]),
    "Chicken Curry": ("Cooked Curries & Gravies", False, 200, 240, [("Chicken", .15), ("Onion", .04), ("Tomato", .04)]),
    "Fish Curry": ("Cooked Curries & Gravies", False, 200, 300, [("Fish Fillet", .15), ("Tomato", .04), ("Onion", .02)]),
    "Grilled Chicken": ("Cooked Curries & Gravies", False, 250, 290, [("Chicken", .20)]),
    "Tomato Soup": ("Cooked Curries & Gravies", True, 200, 80, [("Tomato", .15), ("Onion", .02)]),
    "Chapati": ("Breads & Bakery", True, 100, 80, [("Wheat Flour (Atta)", .07)]),
    "Butter Naan": ("Breads & Bakery", True, 90, 130, [("Wheat Flour (Atta)", .06), ("Butter", .005)]),
    "Idli": ("Snacks & Sweets", True, 150, 70, [("Urad Dal", .03), ("Semolina (Rava)", .05)]),
    "Masala Dosa": ("Snacks & Sweets", True, 180, 95, [("Rice Flour", .06), ("Urad Dal", .02), ("Potato", .06)]),
    "Upma": ("Snacks & Sweets", True, 200, 75, [("Semolina (Rava)", .06), ("Onion", .02)]),
    "Poha": ("Snacks & Sweets", True, 180, 70, [("Poha (Flattened Rice)", .06), ("Onion", .02), ("Green Peas", .01)]),
    "Samosa": ("Snacks & Sweets", True, 100, 120, [("Wheat Flour (Atta)", .04), ("Potato", .06), ("Green Peas", .01)]),
    "Egg Bhurji": ("Cooked Curries & Gravies", False, 150, 130, [("Eggs", 2), ("Onion", .03), ("Tomato", .03)]),
    "Veg Sandwich": ("Breads & Bakery", True, 150, 140, [("Wheat Bread", .06), ("Tomato", .02), ("Cheese", .01)]),
    "Butter Cake": ("Breads & Bakery", True, 100, 260, [("Wheat Flour (Atta)", .05), ("Sugar", .03), ("Butter", .02), ("Eggs", 1)]),
    "Butter Croissant": ("Breads & Bakery", True, 80, 300, [("Wheat Flour (Atta)", .05), ("Butter", .03)]),
    "Pasta Arrabbiata": ("Cooked Rice Dishes", True, 250, 160, [("Pasta", .09), ("Tomato", .08), ("Cheese", .01)]),
    "Veg Noodles": ("Cooked Rice Dishes", True, 300, 120, [("Instant Noodles", .10), ("Cabbage", .03), ("Capsicum", .02)]),
    "Fruit Salad": ("Snacks & Sweets", True, 150, 110, [("Seasonal Fruit Mix", .10), ("Banana", .05)]),
    "Gulab Jamun": ("Snacks & Sweets", True, 80, 380, [("Sweets (Mithai)", .08)]),
}

BREAKFAST_DISHES = {"Idli", "Masala Dosa", "Upma", "Poha", "Egg Bhurji", "Veg Sandwich", "Butter Croissant", "Butter Cake", "Fruit Salad"}
SNACK_DISHES = {"Samosa", "Veg Sandwich", "Butter Cake", "Fruit Salad", "Butter Croissant", "Pasta Arrabbiata", "Idli"}
MAIN_EXCLUDED = {"Butter Croissant", "Butter Cake", "Egg Bhurji"}

_MESS = ["Steamed Rice", "Sambar Rice", "Dal Tadka", "Chapati", "Mixed Veg Curry", "Curd Rice", "Idli", "Upma",
         "Poha", "Rajma Masala", "Veg Biryani", "Chole Masala", "Vegetable Pulao", "Egg Bhurji"]
DISH_POOLS = {
    "Fine Dining": ["Veg Biryani", "Chicken Biryani", "Paneer Butter Masala", "Palak Paneer", "Fish Curry", "Chicken Curry",
                    "Butter Naan", "Grilled Chicken", "Gulab Jamun", "Tomato Soup", "Dal Tadka", "Jeera Rice"],
    "Casual Dining": ["Veg Biryani", "Chicken Biryani", "Dal Tadka", "Chole Masala", "Mixed Veg Curry", "Chapati", "Jeera Rice",
                      "Rajma Masala", "Paneer Butter Masala", "Chicken Curry", "Masala Dosa", "Steamed Rice"],
    "Cafe & Bakery": ["Veg Sandwich", "Butter Cake", "Butter Croissant", "Samosa", "Egg Bhurji", "Pasta Arrabbiata", "Fruit Salad", "Poha"],
    "Quick Service": ["Veg Fried Rice", "Veg Noodles", "Pasta Arrabbiata", "Samosa", "Veg Sandwich", "Chicken Biryani"],
    "College Mess": _MESS, "School Canteen": _MESS, "Hostel Mess": _MESS,
    "Corporate Cafeteria": ["Veg Biryani", "Chicken Biryani", "Chapati", "Dal Tadka", "Mixed Veg Curry", "Paneer Butter Masala",
                            "Jeera Rice", "Fruit Salad", "Veg Fried Rice", "Samosa"],
    "Hospital Kitchen": ["Dal Khichdi", "Steamed Rice", "Chapati", "Mixed Veg Curry", "Dal Tadka", "Curd Rice", "Tomato Soup",
                         "Idli", "Upma", "Fruit Salad"],
    "Supermarket": ["Veg Sandwich", "Samosa", "Butter Cake", "Fruit Salad", "Veg Biryani", "Butter Croissant"],
    "Club House": ["Chicken Biryani", "Veg Biryani", "Butter Naan", "Paneer Butter Masala", "Chicken Curry", "Gulab Jamun",
                   "Grilled Chicken", "Veg Fried Rice", "Mixed Veg Curry"],
}

# --- non-residential establishments: (name, category, capacity, extra)
# extra keys: cuisine, buffet, mess ('VEG'|'NON_VEG'|'MIXED'), overprep (planted signal), cal (academic calendar)
ESTABLISHMENTS = [
    ("The Saffron Table", "Fine Dining", 90, {"cuisine": "North Indian", "buffet": False}),
    ("Maple & Ember", "Fine Dining", 110, {"cuisine": "Continental", "buffet": False}),
    ("Orchid Terrace", "Fine Dining", 120, {"cuisine": "Multi-cuisine", "buffet": True}),
    ("Spice Route Kitchen", "Casual Dining", 100, {"cuisine": "South Indian", "buffet": False}),
    ("Green Leaf Meals", "Casual Dining", 140, {"cuisine": "Vegetarian", "buffet": True}),
    ("Annapurna Family Restaurant", "Casual Dining", 120, {"cuisine": "North Indian", "buffet": False}),
    ("Curry Leaf Corner", "Casual Dining", 70, {"cuisine": "South Indian", "buffet": False}),
    ("Biryani House No. 9", "Casual Dining", 90, {"cuisine": "Hyderabadi", "buffet": False}),
    ("Dosa Junction", "Casual Dining", 60, {"cuisine": "South Indian", "buffet": False}),
    ("Brew & Crumb", "Cafe & Bakery", 40, {"cuisine": "Cafe", "buffet": False}),
    ("Little Oven Bakery", "Cafe & Bakery", 30, {"cuisine": "Bakery", "buffet": False}),
    ("Morning Glory Cafe", "Cafe & Bakery", 50, {"cuisine": "Cafe", "buffet": False}),
    ("The Chai Loft", "Cafe & Bakery", 45, {"cuisine": "Tea House", "buffet": False}),
    ("Wrap Express", "Quick Service", 50, {"cuisine": "Fast Food", "buffet": False}),
    ("Rice Bowl Co.", "Quick Service", 60, {"cuisine": "Asian", "buffet": False}),
    ("Quick Plate Diner", "Quick Service", 70, {"cuisine": "Fast Food", "buffet": False}),
    ("Northfield Engineering College Mess", "College Mess", 2400, {"mess": "MIXED", "cal": "ENGG-2026"}),
    ("Lakeview Arts College Mess", "College Mess", 1300, {"mess": "VEG", "cal": "ARTS-2026"}),
    ("City Science College Mess", "College Mess", 1800, {"mess": "MIXED", "cal": "SCI-2026"}),
    ("Sunrise Public School Canteen", "School Canteen", 900, {"mess": "VEG", "cal": "CBSE-2026"}),
    ("Greenfield Academy Canteen", "School Canteen", 1100, {"mess": "VEG", "cal": "CBSE-2026", "overprep": 1.38}),
    ("Scholars Boys Hostel Mess", "Hostel Mess", 480, {"mess": "MIXED", "cal": "HOSTEL-2026"}),
    ("Scholars Girls Hostel Mess", "Hostel Mess", 420, {"mess": "MIXED", "cal": "HOSTEL-2026"}),
    ("TechPark Cafeteria A", "Corporate Cafeteria", 1400, {"mess": "MIXED", "cal": None}),
    ("TechPark Cafeteria B", "Corporate Cafeteria", 900, {"mess": "MIXED", "cal": None}),
    ("Finserve Towers Cafeteria", "Corporate Cafeteria", 600, {"mess": "VEG", "cal": None}),
    ("Metro General Hospital Kitchen", "Hospital Kitchen", 280, {"mess": "MIXED", "cal": None}),
    ("Lifeline Care Hospital Kitchen", "Hospital Kitchen", 150, {"mess": "MIXED", "cal": None}),
    ("FreshMart Supermarket", "Supermarket", 1500, {"cuisine": "Retail deli counter", "buffet": False}),
    ("Daily Basket Supermarket", "Supermarket", 900, {"cuisine": "Retail deli counter", "buffet": False}),
    ("Lakeside Club", "Club House", 350, {"cuisine": "Multi-cuisine", "buffet": True}),
    ("Riverside Recreation Club", "Club House", 220, {"cuisine": "Multi-cuisine", "buffet": False}),
]

RESIDENTIAL_NAMES = [
    "Palm Residency", "Orchid Heights", "Lotus Apartments", "Jasmine Court", "Cedar Gardens", "Sapphire Towers",
    "Maple Grove Apartments", "Banyan Park Residency", "Marigold Enclave", "Willow Creek Apartments",
    "Silver Oak Residency", "Harmony Heights", "Sunrise Enclave", "Lakeview Apartments",
]
HOUSE_CLUSTER_NAMES = [
    "Mango Lane Houses", "Neem Street Houses", "Tulip Road Houses", "Teak Avenue Houses", "Coconut Grove Houses",
    "Rose Lane Houses", "Peacock Road Houses", "Guava Street Houses", "Lilac Avenue Houses", "Bamboo Lane Houses",
]

SUPPLIERS = [
    ("Greenacre Farms (produce)", "FARM", "produce"),         # planted signal: 3x spoilage
    ("City Wholesale Mandi", "WHOLESALE", "produce"),
    ("Dairy Fresh Distributors", "DISTRIBUTOR", "dairy"),
    ("Meatline Poultry Traders", "WHOLESALE", "meat"),
    ("Ocean Catch Traders", "WHOLESALE", "fish"),
    ("Grain Depot Wholesale", "WHOLESALE", "grain"),
    ("Spice & Oil Merchants", "DISTRIBUTOR", "spice"),
    ("Packaged Goods Distributors", "DISTRIBUTOR", "packaged"),
    ("Daily Bread Bakers", "RETAIL", "bread"),
]
CATEGORY_SUPPLIER_GROUP = {
    "Vegetables": "produce", "Fruits": "produce", "Dairy": "dairy", "Eggs": "dairy", "Meat & Poultry": "meat",
    "Fish & Seafood": "fish", "Cereals & Grains": "grain", "Pulses & Legumes": "grain", "Oils & Condiments": "spice",
    "Packaged & Processed": "packaged", "Beverages": "packaged", "Snacks & Sweets": "packaged", "Breads & Bakery": "bread",
}

RECIPIENTS = [
    ("Annapoorna Community Kitchen", "NGO", True, 300, "19:00", "21:30",
     "We serve about 200 vegetarian dinners every night to daily-wage workers. Van available after 7pm. Happy to take cooked rice, dal and curries; no raw meat."),
    ("Hope Shelter for the Homeless", "SHELTER", True, 120, "18:30", "21:00",
     "Night shelter feeding roughly 80 people dinner and breakfast. Accepts cooked vegetarian and non-vegetarian food that is still hot or freshly packed."),
    ("Street Dog Care Trust", "ANIMAL_SHELTER", True, 60, "17:00", "20:00",
     "Animal shelter that needs plain cooked rice, chapati, curd rice and boiled eggs for about 70 dogs. No spicy or sweet food."),
    ("Green Cycle Compost Unit", "COMPOST_UNIT", False, 400, "08:00", "18:00",
     "Community composting unit collecting vegetable peels, spoiled produce and fruit waste. Cannot take cooked food, dairy or meat."),
    ("Block B Community Fridge", "COMMUNITY_FRIDGE", True, 40, "09:00", "21:00",
     "Public fridge open all day. Wants packaged items, fruit, bread, sandwiches and sealed sweets that can be picked up by anyone."),
    ("Little Hands Orphanage Kitchen", "NGO", True, 90, "07:00", "09:00",
     "Children's home with 60 residents. Needs breakfast items such as idli, upma, poha, bread and fruit, and snacks like biscuits. Vegetarian only."),
    ("Elder Care Home Meals", "SHELTER", True, 50, "11:00", "13:30",
     "Residential care for 35 senior citizens. Prefers soft, mildly spiced vegetarian lunch: khichdi, dal, curd rice, soup. Pickup by 1pm."),
    ("Evening Soup Run Volunteers", "NGO", True, 150, "20:00", "22:00",
     "Volunteer group serving hot meals from a van near the bus terminus, around 120 portions nightly. Cooked vegetarian and non-vegetarian food welcome."),
]

# --- locality events as (name, type, start offset from window start, length days, impact, scope)
# scope: 'SECTOR' (linked to the sector) or a list of block indices (0..5)
EVENTS = [
    ("Mid-term Examination Period", "EXAM_PERIOD", 20, 14, 1, "SECTOR"),
    ("Independence Day Holiday", "PUBLIC_HOLIDAY", 45, 1, 1, "SECTOR"),
    ("Regional Harvest Festival", "FESTIVAL", 60, 4, 2, "SECTOR"),
    ("Semester Vacation", "VACATION", 85, 26, -2, "SECTOR"),
    ("Block C Street Food Fair", "LOCAL_EVENT", 120, 2, 1, [2, 3]),
    ("Final Examination Period", "EXAM_PERIOD", 135, 13, 1, "SECTOR"),
]

DEMO_USERS_NOTE = "All demo accounts share the password in DEMO_USER_PASSWORD (.env). Local demo use only."

MESSY_NAME_VARIANTS = {
    "Veg Biryani": ["Veg Biriyani", "veg biryani", "VEG. BIRYANI", "Vegetable Biryani", "Veg Biriyani (Special)"],
    "Chicken Biryani": ["Chicken Biriyani", "chicken biryani", "CHKN BIRYANI", "Chicken Dum Biryani"],
    "Paneer Butter Masala": ["Paneer Butter Masala", "paneer butter masala", "Panner Butter Masala", "PBM"],
    "Dal Tadka": ["Dal Tadka", "dal tadka", "Daal Tadka", "Dhal Tadka"],
    "Masala Dosa": ["Masala Dosa", "masala dosai", "Masala Dosa (Plain)", "MASALA DOSA"],
    "Steamed Rice": ["Steamed Rice", "plain rice", "White Rice", "STEAMED RICE"],
    "Chapati": ["Chapati", "chapathi", "Chappathi", "Roti"],
    "Mixed Veg Curry": ["Mixed Veg Curry", "mixed vegetable curry", "Mix Veg", "MIXED VEG CURRY"],
    "Chole Masala": ["Chole Masala", "channa masala", "Chana Masala", "Chole Masala"],
    "Jeera Rice": ["Jeera Rice", "jeera rice", "Cumin Rice", "JEERA RICE"],
}

NOTE_TEMPLATES = {  # latent cause -> free-text notes (used for waste_event.notes; embeddings come later)
    "OVER_PREPARATION": ["Cooked for the usual crowd but fewer people came.", "Batch size not reduced after the menu change.",
                         "Prepared extra rice for the expected rush, it never came.", "Over-estimated headcount for today."],
    "LOW_TURNOUT": ["Rain kept customers away this evening.", "Many students on leave, attendance was low.",
                    "Cancelled booking meant a lot of food unused.", "Unexpected holiday reduced footfall."],
    "SPOILAGE": ["Vegetables turned soft because of humidity in storage.", "Fridge door left open overnight.",
                 "Produce delivery arrived already wilting.", "Leafy greens rotted before use."],
    "EXPIRED_UNUSED": ["Dairy passed its use-by date before being used.", "Stock rotation missed, packets expired.",
                       "Bread expired because order was too large."],
    "PREPARATION_ERROR": ["Curry was over-salted and discarded.", "Rice burnt at the bottom of the vessel."],
    "QUALITY_REJECTION": ["Rejected a crate of tomatoes on receipt.", "Chicken delivery failed the smell check."],
}
