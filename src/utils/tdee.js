export function calculateTargets(profile) {
    const { weight_kg, height_cm, date_of_birth, gender, activity_level, goal } = profile
  
    const age = Math.floor(
      (Date.now() - new Date(date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)
    )
  
    const bmrMale   = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
    const bmrFemale = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
    const bmr =
      gender === 'male'   ? bmrMale :
      gender === 'female' ? bmrFemale :
      (bmrMale + bmrFemale) / 2
  
    const multipliers = {
      sedentary:   1.2,
      light:       1.375,
      moderate:    1.55,
      active:      1.725,
      very_active: 1.9,
    }
    const tdee = bmr * multipliers[activity_level]
  
    const adjustments = {
      lose_weight:     -500,
      maintain:           0,
      gain_muscle:      250,
      improve_fitness:    0,
    }
    const rawCalories = tdee + adjustments[goal]
    const calorie_target = Math.round(rawCalories / 50) * 50

    const proteinPerKg = {
        lose_weight:     2.2,
        maintain:        1.8,
        gain_muscle:     2.0,
        improve_fitness: 1.8,
      }
      const protein_target_g = Math.round(weight_kg * proteinPerKg[goal])
      const proteinCalories  = protein_target_g * 4
    
      const remaining = calorie_target - proteinCalories
      const carbsPct = {
        lose_weight:     0.40,
        maintain:        0.50,
        gain_muscle:     0.50,
        improve_fitness: 0.45,
      }
      const fatPct = {
        lose_weight:     0.30,
        maintain:        0.25,
        gain_muscle:     0.20,
        improve_fitness: 0.30,
      }
      const carbs_target_g = Math.round((remaining * carbsPct[goal]) / 4)
      const fat_target_g   = Math.round((remaining * fatPct[goal])   / 9)
    
      return { calorie_target, protein_target_g, carbs_target_g, fat_target_g }
    }