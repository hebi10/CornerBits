use serde::{Deserialize, Deserializer, Serialize};

const MAX_COUNT: u64 = 1_000_000_000_000;
const MAX_TIMESTAMP: u64 = 8_640_000_000_000_000;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

// JSON numbers such as 1.0 and 1e0 are also integers in the frontend. Keep
// the Rust boundary consistent without accepting strings or fractions.
fn integer(number: serde_json::Number) -> Result<u64, &'static str> {
    if let Some(value) = number.as_u64() {
        return Ok(value);
    }
    let value = number.as_f64().ok_or("정수가 필요합니다.")?;
    if value.is_finite() && value >= 0.0 && value <= MAX_SAFE_INTEGER as f64 && value.fract() == 0.0
    {
        Ok(value as u64)
    } else {
        Err("음수가 아닌 안전한 정수가 필요합니다.")
    }
}

pub(crate) fn deserialize_integer<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    integer(serde_json::Number::deserialize(deserializer)?).map_err(serde::de::Error::custom)
}

fn deserialize_integers<'de, D>(deserializer: D) -> Result<Vec<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    Vec::<serde_json::Number>::deserialize(deserializer)?
        .into_iter()
        .map(|number| integer(number).map_err(serde::de::Error::custom))
        .collect()
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MineState {
    #[serde(deserialize_with = "deserialize_integer")]
    pub depth: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub pickaxe: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub coins: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    pub inventory: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integers")]
    pub collected: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integers")]
    pub tiles: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    pub total_mined: u64,
}

impl Default for MineState {
    fn default() -> Self {
        Self {
            depth: 1,
            pickaxe: 1,
            coins: 0,
            inventory: vec![0; 30],
            collected: vec![0; 30],
            tiles: vec![2; 25],
            total_mined: 0,
        }
    }
}

impl MineState {
    fn validate(&self) -> Result<(), String> {
        if !(1..=1_000_000).contains(&self.depth)
            || !(1..=10).contains(&self.pickaxe)
            || self.coins > MAX_COUNT
            || self.inventory.len() != 30
            || self.collected.len() != 30
            || self.tiles.len() != 25
            || !valid_total(&self.collected, self.total_mined)
            || self
                .inventory
                .iter()
                .zip(&self.collected)
                .any(|(inventory, collected)| inventory > collected)
        {
            return Err("광산 저장 데이터가 올바르지 않습니다.".into());
        }
        let durability = 2 * (1 + (self.depth - 1) / 100).min(10);
        if self.tiles.iter().any(|tile| *tile > durability) {
            return Err("광산 블록의 내구도가 올바르지 않습니다.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Plant {
    #[serde(deserialize_with = "deserialize_integer")]
    pub species: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub planted_at: u64,
    pub watered: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GardenState {
    #[serde(deserialize_with = "deserialize_integer")]
    pub unlocked_species: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub coins: u64,
    pub pots: Vec<Option<Plant>>,
    #[serde(deserialize_with = "deserialize_integers")]
    pub harvested: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    pub total_harvests: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub last_observed_at: u64,
}

impl Default for GardenState {
    fn default() -> Self {
        Self {
            unlocked_species: 1,
            coins: 0,
            pots: vec![None; 3],
            harvested: vec![0; 40],
            total_harvests: 0,
            last_observed_at: 0,
        }
    }
}

impl GardenState {
    fn validate(&self) -> Result<(), String> {
        if !(1..=40).contains(&self.unlocked_species)
            || self.coins > MAX_COUNT
            || !(3..=12).contains(&self.pots.len())
            || self.harvested.len() != 40
            || !valid_total(&self.harvested, self.total_harvests)
            || self.last_observed_at > MAX_TIMESTAMP
            || self
                .pots
                .iter()
                .flatten()
                .any(|plant| plant.species > 39 || plant.planted_at > self.last_observed_at)
        {
            return Err("정원 저장 데이터가 올바르지 않습니다.".into());
        }
        Ok(())
    }
}

// v2/v3 gardens had no permanent unlock count. Keep their exact shape strict
// rather than making the v4 field optional at the IPC/storage boundary.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LegacyGardenState {
    #[serde(deserialize_with = "deserialize_integer")]
    coins: u64,
    pots: Vec<Option<Plant>>,
    #[serde(deserialize_with = "deserialize_integers")]
    harvested: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    total_harvests: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    last_observed_at: u64,
}

impl From<LegacyGardenState> for GardenState {
    fn from(previous: LegacyGardenState) -> Self {
        let mut unlocked_species = 1;
        for species in 0..40 {
            if species == 0
                || previous
                    .harvested
                    .get(species - 1)
                    .is_some_and(|count| *count >= 5)
                || previous
                    .harvested
                    .get(species)
                    .is_some_and(|count| *count > 0)
                || previous
                    .pots
                    .iter()
                    .flatten()
                    .any(|plant| plant.species >= species as u64)
            {
                unlocked_species = species as u64 + 1;
            }
        }
        Self {
            unlocked_species,
            coins: previous.coins,
            pots: previous.pots,
            harvested: previous.harvested,
            total_harvests: previous.total_harvests,
            last_observed_at: previous.last_observed_at,
        }
    }
}

fn valid_total(counts: &[u64], total: u64) -> bool {
    total <= MAX_COUNT
        && counts.iter().all(|count| *count <= MAX_COUNT)
        && counts
            .iter()
            .try_fold(0_u64, |sum, count| sum.checked_add(*count))
            == Some(total)
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CircuitState {
    #[serde(deserialize_with = "deserialize_integer")]
    pub stage: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    pub rotations: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    pub turns: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    pub records: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    pub total_clears: u64,
}

impl Default for CircuitState {
    fn default() -> Self {
        Self {
            stage: 1,
            // Generator v1 stage 1 scramble, shared with the frontend.
            rotations: vec![3, 2, 0, 2, 0, 2, 1, 1, 3, 2, 1, 1, 3, 1, 3, 0],
            turns: 0,
            records: vec![0; 300],
            total_clears: 0,
        }
    }
}

impl CircuitState {
    fn validate(&self) -> Result<(), String> {
        let completed = self
            .records
            .iter()
            .take_while(|record| **record > 0)
            .count();
        if !(1..=300).contains(&self.stage)
            || self.rotations.len() != if self.stage <= 150 { 16 } else { 25 }
            || self.rotations.iter().any(|rotation| *rotation > 3)
            || self.turns > 1_000_000
            || self.records.len() != 300
            || self.records.iter().any(|record| *record > 1_000_000)
            || self.records[completed..].iter().any(|record| *record != 0)
            || self.stage > (completed as u64 + 1).min(300)
            || self.total_clears < completed as u64
            || self.total_clears > MAX_COUNT
        {
            return Err("회로 저장 데이터가 올바르지 않습니다.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FishingCast {
    #[serde(deserialize_with = "deserialize_integer")]
    pub started_at: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub bite_at: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub expires_at: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub species: u64,
}

fn deserialize_cast<'de, D>(deserializer: D) -> Result<Option<FishingCast>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<FishingCast>::deserialize(deserializer)
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FishingState {
    #[serde(deserialize_with = "deserialize_integer")]
    pub rng: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub coins: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub rod: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub location: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub bait: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    pub caught: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integers")]
    pub keepsakes: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integers")]
    pub inventory: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    pub inventory_bonus: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    pub bait_stock: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    pub unlocked_locations: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub total_caught: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub casts: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub misses: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub streak: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub best_streak: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub last_observed_at: u64,
    #[serde(deserialize_with = "deserialize_cast")]
    pub cast: Option<FishingCast>,
}

impl Default for FishingState {
    fn default() -> Self {
        Self {
            rng: 0x6d2b79f5,
            coins: 0,
            rod: 1,
            location: 0,
            bait: 0,
            caught: vec![0; 36],
            keepsakes: Vec::new(),
            inventory: vec![0; 36],
            inventory_bonus: 0,
            bait_stock: vec![0; 2],
            unlocked_locations: 1,
            total_caught: 0,
            casts: 0,
            misses: 0,
            streak: 0,
            best_streak: 0,
            last_observed_at: 0,
            cast: None,
        }
    }
}

impl FishingState {
    fn validate(&self) -> Result<(), String> {
        if !(1..=u32::MAX as u64).contains(&self.rng)
            || self.coins > MAX_COUNT
            || !(1..=8).contains(&self.rod)
            || self.location > 5
            || self.bait > 2
            || self.caught.len() != 36
            || !valid_total(&self.caught, self.total_caught)
            || self.keepsakes.len() > 3
            || self.keepsakes.iter().enumerate().any(|(index, species)| {
                *species > 35
                    || self.caught.get(*species as usize).copied().unwrap_or(0) == 0
                    || self.keepsakes[..index].contains(species)
            })
            || self.inventory.len() != 36
            || self
                .inventory
                .iter()
                .zip(&self.caught)
                .any(|(stock, caught)| stock > caught)
            || self.inventory.iter().sum::<u64>() > self.total_caught
            || self.inventory_bonus > MAX_COUNT
            || self.bait_stock.len() != 2
            || self.bait_stock.iter().any(|count| *count > MAX_COUNT)
            || !(1..=6).contains(&self.unlocked_locations)
            || self.location >= self.unlocked_locations
            || self.casts > MAX_COUNT
            || self.misses > MAX_COUNT
            || self.streak > self.best_streak
            || self.best_streak > self.total_caught
            || self.last_observed_at > MAX_TIMESTAMP
            || self
                .total_caught
                .checked_add(self.misses)
                .and_then(|total| total.checked_add(u64::from(self.cast.is_some())))
                != Some(self.casts)
            || self.cast.as_ref().is_some_and(|cast| {
                cast.started_at > cast.bite_at
                    || cast.bite_at >= cast.expires_at
                    || cast.expires_at > MAX_TIMESTAMP
                    || cast.started_at > self.last_observed_at
                    || cast.species > 35
                    || cast.species / 6 != self.location
            })
        {
            return Err("낚시 저장 데이터가 올바르지 않습니다.".into());
        }
        let base_sale_value =
            self.inventory
                .iter()
                .enumerate()
                .fold(0_u128, |total, (species, count)| {
                    total
                        + u128::from(*count)
                            * (12 + species as u128 / 6 * 8 + species as u128 % 6 * 12)
                });
        if u128::from(self.inventory_bonus) > base_sale_value / 2 {
            return Err("낚시 판매 보너스가 올바르지 않습니다.".into());
        }
        Ok(())
    }
}

// Before v6, catches paid coins immediately and no sale stock was stored.
// Keep that exact shape separate so migration cannot credit those catches twice.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LegacyFishingState {
    #[serde(deserialize_with = "deserialize_integer")]
    rng: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    coins: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    rod: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    location: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    bait: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    caught: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    total_caught: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    casts: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    misses: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    streak: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    best_streak: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    last_observed_at: u64,
    #[serde(deserialize_with = "deserialize_cast")]
    cast: Option<FishingCast>,
}

impl From<LegacyFishingState> for FishingState {
    fn from(previous: LegacyFishingState) -> Self {
        let keepsakes = legacy_keepsakes(&previous.caught);
        let unlocked_from_catches = [0, 70, 220, 450, 800, 1200]
            .iter()
            .take_while(|threshold| previous.total_caught >= **threshold)
            .count() as u64;
        Self {
            rng: previous.rng,
            coins: previous.coins,
            rod: previous.rod,
            location: previous.location,
            bait: previous.bait,
            caught: previous.caught,
            keepsakes,
            inventory: vec![0; 36],
            inventory_bonus: 0,
            bait_stock: vec![0; 2],
            unlocked_locations: unlocked_from_catches.max(previous.location.saturating_add(1)),
            total_caught: previous.total_caught,
            casts: previous.casts,
            misses: previous.misses,
            streak: previous.streak,
            best_streak: previous.best_streak,
            last_observed_at: previous.last_observed_at,
            cast: previous.cast,
        }
    }
}

fn legacy_keepsakes(caught: &[u64]) -> Vec<u64> {
    caught
        .iter()
        .enumerate()
        .rev()
        .filter_map(|(index, count)| (*count > 0).then_some(index as u64))
        .take(3)
        .collect()
}

// v6 stored trade inventory but had no persistent fish display.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LegacyFishingV6 {
    #[serde(deserialize_with = "deserialize_integer")]
    rng: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    coins: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    rod: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    location: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    bait: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    caught: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integers")]
    inventory: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    inventory_bonus: u64,
    #[serde(deserialize_with = "deserialize_integers")]
    bait_stock: Vec<u64>,
    #[serde(deserialize_with = "deserialize_integer")]
    unlocked_locations: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    total_caught: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    casts: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    misses: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    streak: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    best_streak: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    last_observed_at: u64,
    #[serde(deserialize_with = "deserialize_cast")]
    cast: Option<FishingCast>,
}

impl From<LegacyFishingV6> for FishingState {
    fn from(previous: LegacyFishingV6) -> Self {
        let keepsakes = legacy_keepsakes(&previous.caught);
        Self {
            rng: previous.rng,
            coins: previous.coins,
            rod: previous.rod,
            location: previous.location,
            bait: previous.bait,
            caught: previous.caught,
            keepsakes,
            inventory: previous.inventory,
            inventory_bonus: previous.inventory_bonus,
            bait_stock: previous.bait_stock,
            unlocked_locations: previous.unlocked_locations,
            total_caught: previous.total_caught,
            casts: previous.casts,
            misses: previous.misses,
            streak: previous.streak,
            best_streak: previous.best_streak,
            last_observed_at: previous.last_observed_at,
            cast: previous.cast,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SwordResult {
    #[default]
    None,
    Success,
    Failure,
    Safe,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SwordState {
    #[serde(deserialize_with = "deserialize_integer")]
    pub rng: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub level: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub ore: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub shards: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub attempts: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub successes: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub failures: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub pity: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub total_polishes: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub last_observed_at: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub next_polish_at: u64,
    pub last_result: SwordResult,
}

impl Default for SwordState {
    fn default() -> Self {
        Self {
            rng: 0x1a2b3c4d,
            level: 0,
            ore: 0,
            shards: 0,
            attempts: 0,
            successes: 0,
            failures: 0,
            pity: 0,
            total_polishes: 0,
            last_observed_at: 0,
            next_polish_at: 0,
            last_result: SwordResult::None,
        }
    }
}

impl SwordState {
    fn validate(&self) -> Result<(), String> {
        if !(1..=u32::MAX as u64).contains(&self.rng)
            || self.level > 60
            || self.ore > MAX_COUNT
            || self.shards > MAX_COUNT
            || self.attempts > MAX_COUNT
            || self.successes != self.level
            || self.failures > MAX_COUNT
            || self.successes.checked_add(self.failures) != Some(self.attempts)
            || self.pity > 39
            || self.pity > self.failures
            || self.total_polishes > MAX_COUNT
            || self.last_observed_at > MAX_TIMESTAMP
            || self.next_polish_at > MAX_TIMESTAMP
            || self.next_polish_at > self.last_observed_at.saturating_add(10_000)
        {
            return Err("검 키우기 저장 데이터가 올바르지 않습니다.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Games {
    pub mine: MineState,
    pub garden: GardenState,
    pub circuit: CircuitState,
    pub fishing: FishingState,
    pub sword: SwordState,
}

impl Games {
    pub fn validate(&self) -> Result<(), String> {
        self.mine.validate()?;
        self.garden.validate()?;
        self.circuit.validate()?;
        self.fishing.validate()?;
        self.sword.validate()
    }
}
