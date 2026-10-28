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
        if self.coins > MAX_COUNT
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

fn valid_total(counts: &[u64], total: u64) -> bool {
    total <= MAX_COUNT
        && counts.iter().all(|count| *count <= MAX_COUNT)
        && counts
            .iter()
            .try_fold(0_u64, |sum, count| sum.checked_add(*count))
            == Some(total)
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Games {
    pub mine: MineState,
    pub garden: GardenState,
}

impl Games {
    pub fn validate(&self) -> Result<(), String> {
        self.mine.validate()?;
        self.garden.validate()
    }
}
