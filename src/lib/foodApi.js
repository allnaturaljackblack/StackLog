import axios from 'axios'

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'
const API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY

export async function searchFoods(query, includeBranded = false) {
    try {
      // First fetch generic/foundation foods
      const genericResponse = await axios.post(
        `${USDA_BASE}/foods/search`,
        {
          query,
          dataType: ['Survey (FNDDS)', 'SR Legacy', 'Foundation'],
          pageSize: 15,
          sortBy: 'dataType.keyword',
          sortOrder: 'asc',
        },
        { params: { api_key: API_KEY }, timeout: 10000 }
      )
  
      const genericFoods = (genericResponse.data?.foods || []).map(f => normalizeUSDAProduct(f, false))
  
      if (!includeBranded) {
        return genericFoods
      }
  
      // Also fetch branded if requested
      const brandedResponse = await axios.post(
        `${USDA_BASE}/foods/search`,
        {
          query,
          dataType: ['Branded'],
          pageSize: 10,
          sortBy: 'score',
          sortOrder: 'desc',
        },
        { params: { api_key: API_KEY }, timeout: 10000 }
      )
  
      const brandedFoods = (brandedResponse.data?.foods || []).map(f => normalizeUSDAProduct(f, true))
      return [...genericFoods, ...brandedFoods]
  
    } catch (error) {
      console.error('Food search error:', error.message)
      return []
    }
  }
  
  // Fetch full food details including serving sizes from USDA
  export async function getFoodDetails(fdcId) {
    try {
      const response = await axios.get(
        `${USDA_BASE}/food/${fdcId}`,
        { params: { api_key: API_KEY }, timeout: 10000 }
      )
      return response.data
    } catch (error) {
      // 404 is expected for some USDA food types — return null silently
      if (error.response?.status === 404) return null
      console.error('Food details error:', error.message)
      return null
    }
  }
  
  // Extract serving size options from USDA food detail response
  export function extractServingOptions(usdaDetail, foodName = '') {
    const servings = []
    const seenLabels = new Set()
  
    if (usdaDetail) {
      const portions = usdaDetail.foodPortions || []
      portions.forEach(portion => {
        let label = portion.modifier || portion.portionDescription || portion.measureUnit?.name || ''
        label = label
          .replace(/racc/gi, 'serving')
          .replace(/nlea serving/gi, 'serving')
          .replace(/^quantity not specified$/i, 'serving')
          .trim()
          .toLowerCase()
  
        const grams = portion.gramWeight
        if (!label || !grams || grams <= 0) return
        if (seenLabels.has(label)) return
        seenLabels.add(label)
  
        const display = label.charAt(0).toUpperCase() + label.slice(1)
        servings.push({
          label,
          display,
          gramsPerUnit: grams,
          score: scoreServing(label, grams),
        })
      })
    }
  
    // Hardcoded fallbacks for common foods with no USDA portion data
    const name = foodName.toLowerCase()
    if (servings.length === 0 && name.includes('egg')) {
      const eggSizes = [
        { label: 'large egg',       display: 'Large egg',       gramsPerUnit: 50  },
        { label: 'medium egg',      display: 'Medium egg',      gramsPerUnit: 44  },
        { label: 'extra large egg', display: 'Extra large egg', gramsPerUnit: 56  },
        { label: 'jumbo egg',       display: 'Jumbo egg',       gramsPerUnit: 63  },
        { label: 'small egg',       display: 'Small egg',       gramsPerUnit: 38  },
      ]
      eggSizes.forEach(e => {
        servings.push({ ...e, score: scoreServing(e.label, e.gramsPerUnit) })
        seenLabels.add(e.label)
      })
    }
  
    // Sort by score
    servings.sort((a, b) => b.score - a.score)
  
    if (!seenLabels.has('grams')) {
      servings.push({ label: 'grams', display: 'g', gramsPerUnit: 1, score: -1 })
    }
    if (!seenLabels.has('oz') && !seenLabels.has('ounce') && !seenLabels.has('ounces')) {
      servings.push({ label: 'oz', display: 'oz', gramsPerUnit: 28.3495, score: -1 })
    }
  
    return servings
  }
  
  function scoreServing(label, grams) {
    const l = label.toLowerCase()
    let score = 0
  
    const countableTerms = [
      'large egg', 'medium egg', 'small egg', 'extra large egg', 'jumbo egg',
      'egg', 'piece', 'slice', 'strip', 'patty', 'link', 'fillet',
      'tablet', 'capsule', 'scoop', 'bar', 'ball', 'cube',
    ]
    for (const term of countableTerms) {
      if (l.includes(term)) { score += 100; break }
    }
  
    const packageTerms = [
      'container', 'bottle', 'can', 'package', 'packet', 'pouch',
      'bag', 'box', 'carton', 'jar',
    ]
    for (const term of packageTerms) {
      if (l.includes(term)) { score += 90; break }
    }
  
    const volumeTerms = ['cup', 'tbsp', 'tsp', 'tablespoon', 'teaspoon', 'fl oz', 'fluid']
    for (const term of volumeTerms) {
      if (l.includes(term)) { score += 70; break }
    }
  
    if (l.includes('oz') || l.includes('ounce')) score += 60
    if (l.includes('lb') || l.includes('pound')) score += 50
  
    if (l === 'serving' || l === 'portion') score -= 20
  
    if (grams >= 20 && grams <= 300) score += 10
    if (grams < 5) score -= 30
  
    return score
  }
  
  export async function lookupBarcode(barcode) {
    // Try USDA first
    try {
      const response = await axios.post(
        `${USDA_BASE}/foods/search`,
        { query: barcode, dataType: ['Branded'], pageSize: 1 },
        { params: { api_key: API_KEY }, timeout: 8000 }
      )
      const foods = response.data?.foods || []
      if (foods.length > 0) return normalizeUSDAProduct(foods[0], true)
    } catch (e) {
      console.log('USDA barcode miss, trying OFF...')
    }
  
    // Fallback to Open Food Facts v2
    try {
        console.log('Trying OFF for barcode:', barcode)
        const response = await axios.get(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=code,product_name,brands,nutriments,serving_size,serving_quantity`,
        {
            headers: { 
            'User-Agent': 'StackLog - iOS - Version 1.0',
            'Accept': 'application/json',
            },
            timeout: 12000,
        }
        )
        if (response.data?.status === 1 && response.data.product) {
        return normalizeOFFProduct(response.data.product)
        }
    } catch (e) {
        console.error('OFF error:', e.message, e.response?.status)
    }
  
    return null
  }

  function normalizeUSDAProduct(product, isBranded = false) {
    const nutrients = product.foodNutrients || []
  
    function getNutrient(...names) {
      for (const name of names) {
        const n = nutrients.find(n =>
          n.nutrientName?.toLowerCase().includes(name.toLowerCase())
        )
        if (n?.value) return parseFloat(n.value)
      }
      return 0
    }
  
    function getCalories() {
      const kcal = nutrients.find(n =>
        n.nutrientName?.toLowerCase().includes('energy') &&
        n.unitName?.toLowerCase() === 'kcal'
      )
      if (kcal?.value) return parseFloat(kcal.value)
      const kj = nutrients.find(n =>
        n.nutrientName?.toLowerCase().includes('energy') &&
        n.unitName?.toLowerCase() === 'kj'
      )
      if (kj?.value) return parseFloat(kj.value) / 4.184
      return getNutrient('Energy', 'energy')
    }
  
    let serving_g = null
    let serving_label = null
    let serving_count = 1
  
    if (product.servingSize && product.servingSizeUnit) {
      const unit = product.servingSizeUnit.toLowerCase()
      if (unit === 'g') {
        serving_g = parseFloat(product.servingSize)
      } else if (unit === 'oz') {
        serving_g = parseFloat(product.servingSize) * 28.3495
      }
  
      if (product.householdServingFullText) {
        const text = product.householdServingFullText.trim()
        const match = text.match(/^(\d+\/\d+|\d+\.?\d*)\s+(.+)$/)
        if (match) {
          const num = eval(match[1])
          const word = match[2].trim()
          serving_count = num
          if (serving_g && num > 0) {
            serving_g = serving_g / num
          }
          serving_label = word.replace(/ies$/i, 'y').replace(/s$/i, '') || word
        } else {
          serving_label = text
        }
      }
    }
  
    return {
      external_id: String(product.fdcId),
      source: 'usda',
      barcode: null,
      name: product.description || 'Unknown Food',
      brand: isBranded ? (product.brandOwner || product.brandName || null) : null,
      image_url: null,
      is_branded: isBranded,
      serving_description: product.servingSize
        ? `${product.servingSize}${product.servingSizeUnit || 'g'}`
        : null,
      serving_g,
      serving_label,
      serving_count,
      calories_per_100g:      getCalories(),
      protein_per_100g:       getNutrient('Protein', 'protein'),
      carbs_per_100g:         getNutrient('Carbohydrate', 'carbohydrate'),
      fat_per_100g:           getNutrient('Total lipid', 'fat'),
      fiber_per_100g:         getNutrient('Fiber', 'fiber'),
      sugar_per_100g:         getNutrient('Sugars', 'sugars'),
      sodium_per_100g:        getNutrient('Sodium', 'sodium') / 1000,
      saturated_fat_per_100g: getNutrient('Saturated'),
    }
  }

  function normalizeOFFProduct(product) {
    const n = product.nutriments || {}
    const getN = (key) => parseFloat(n[`${key}_100g`]) || 0
  
    let serving_g = null
    let serving_label = null
    let serving_count = 1
  
    if (product.serving_size) {
      const gramsMatch = product.serving_size.match(/(\d+\.?\d*)\s*g/i)
      if (gramsMatch) serving_g = parseFloat(gramsMatch[1])
      const labelMatch = product.serving_size.match(/^([^(]+?)\s*(?:\(|\d+\s*g|$)/i)
      if (labelMatch) serving_label = labelMatch[1].trim()
    }
    if (!serving_g && product.serving_quantity) {
      serving_g = parseFloat(product.serving_quantity)
    }
  
    return {
      external_id: product.code || product._id,
      source: 'open_food_facts',
      barcode: product.code,
      name: product.product_name || 'Unknown Product',
      brand: product.brands || null,
      image_url: null,
      is_branded: true,
      serving_description: product.serving_size || null,
      serving_g,
      serving_label: serving_label || 'serving',
      serving_count,
      calories_per_100g:      getN('energy-kcal') || getN('energy') / 4.184,
      protein_per_100g:       getN('proteins'),
      carbs_per_100g:         getN('carbohydrates'),
      fat_per_100g:           getN('fat'),
      fiber_per_100g:         getN('fiber'),
      sugar_per_100g:         getN('sugars'),
      sodium_per_100g:        getN('sodium'),
      saturated_fat_per_100g: getN('saturated-fat'),
    }
  }

  export function calculateNutrition(food, grams) {
    const factor = grams / 100
    return {
      calories:  Math.round((food.calories_per_100g  || 0) * factor * 10) / 10,
      protein_g: Math.round((food.protein_per_100g   || 0) * factor * 10) / 10,
      carbs_g:   Math.round((food.carbs_per_100g     || 0) * factor * 10) / 10,
      fat_g:     Math.round((food.fat_per_100g       || 0) * factor * 10) / 10,
      fiber_g:   Math.round((food.fiber_per_100g     || 0) * factor * 10) / 10,
      sugar_g:   Math.round((food.sugar_per_100g     || 0) * factor * 10) / 10,
      sodium_mg: Math.round((food.sodium_per_100g    || 0) * factor * 1000 * 10) / 10,
    }
  }