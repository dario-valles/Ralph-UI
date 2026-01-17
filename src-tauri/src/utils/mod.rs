// Utility functions
#![allow(dead_code)]

use chrono::Utc;

pub fn generate_id() -> String {
    // Generate a unique ID (using timestamp + random string for now)
    let now = Utc::now().timestamp_millis();
    format!("{}-{}", now, rand_string(8))
}

fn rand_string(len: usize) -> String {
    use std::iter;
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();

    iter::repeat_with(|| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .take(len)
        .collect()
}

pub fn format_cost(tokens: i32, cost_per_million: f64) -> f64 {
    (tokens as f64 / 1_000_000.0) * cost_per_million
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
        assert!(id1.len() > 8);
    }

    #[test]
    fn test_format_cost() {
        let cost = format_cost(1_000_000, 3.0);
        assert_eq!(cost, 3.0);
    }
}
