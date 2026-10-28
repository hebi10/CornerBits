use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Windows reports iconic coordinates when minimized. Never sample those as a
/// real desktop position; the caller retains its last normal position instead.
pub fn normal_window_position<E>(
    minimized: bool,
    read_position: impl FnOnce() -> Result<Point, E>,
) -> Result<Option<Point>, E> {
    if minimized {
        Ok(None)
    } else {
        read_position().map(Some)
    }
}

pub fn clamp(point: Point, size: (u32, u32), monitors: &[Bounds]) -> Point {
    monitors
        .iter()
        .map(|bounds| {
            let max_x = (i64::from(bounds.x) + i64::from(bounds.width) - i64::from(size.0))
                .max(i64::from(bounds.x));
            let max_y = (i64::from(bounds.y) + i64::from(bounds.height) - i64::from(size.1))
                .max(i64::from(bounds.y));
            let x = i64::from(point.x).clamp(i64::from(bounds.x), max_x);
            let y = i64::from(point.y).clamp(i64::from(bounds.y), max_y);
            let distance = (i128::from(point.x) - i128::from(x)).pow(2)
                + (i128::from(point.y) - i128::from(y)).pow(2);
            (
                distance,
                Point {
                    x: x as i32,
                    y: y as i32,
                },
            )
        })
        .min_by_key(|(distance, _)| *distance)
        .map(|(_, point)| point)
        .unwrap_or(point)
}

pub fn clamp_logical(point: Point, size: (u32, u32), monitors: &[(Bounds, f64)]) -> Point {
    monitors
        .iter()
        .map(|(bounds, scale)| {
            let physical = (
                (f64::from(size.0) * scale).round() as u32,
                (f64::from(size.1) * scale).round() as u32,
            );
            let candidate = clamp(point, physical, &[*bounds]);
            let distance = (i128::from(point.x) - i128::from(candidate.x)).pow(2)
                + (i128::from(point.y) - i128::from(candidate.y)).pow(2);
            (distance, candidate)
        })
        .min_by_key(|(distance, _)| *distance)
        .map(|(_, point)| point)
        .unwrap_or(point)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disconnected_monitor_position_returns_to_nearest_connected_work_area() {
        let monitors = [Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        }];
        assert_eq!(
            clamp(Point { x: 3500, y: 1200 }, (280, 380), &monitors),
            Point { x: 1640, y: 660 }
        );
    }

    #[test]
    fn preserves_negative_monitor_coordinates_and_clamps_both_edges() {
        let monitors = [Bounds {
            x: -1280,
            y: 0,
            width: 1280,
            height: 1024,
        }];
        assert_eq!(
            clamp(Point { x: -1200, y: 100 }, (280, 36), &monitors),
            Point { x: -1200, y: 100 }
        );
        assert_eq!(
            clamp(Point { x: -2000, y: -100 }, (280, 380), &monitors),
            Point { x: -1280, y: 0 }
        );
    }

    #[test]
    fn oversized_window_keeps_titlebar_at_work_area_origin() {
        let monitors = [Bounds {
            x: 20,
            y: 30,
            width: 200,
            height: 300,
        }];
        assert_eq!(
            clamp(Point { x: 100, y: 200 }, (280, 380), &monitors),
            Point { x: 20, y: 30 }
        );
    }

    #[test]
    fn compact_window_keeps_bottom_edge_position_when_restarting() {
        let monitors = [(
            Bounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            },
            1.0,
        )];
        assert_eq!(
            clamp_logical(Point { x: 100, y: 1004 }, (280, 36), &monitors),
            Point { x: 100, y: 1004 }
        );
    }

    #[test]
    fn restored_logical_size_uses_destination_monitor_scale() {
        let monitors = [(
            Bounds {
                x: 1920,
                y: 0,
                width: 2560,
                height: 1400,
            },
            2.0,
        )];
        assert_eq!(
            clamp_logical(Point { x: 4300, y: 1380 }, (280, 36), &monitors),
            Point { x: 3920, y: 1328 }
        );
    }

    #[test]
    fn minimized_window_does_not_sample_iconic_coordinates() {
        let observed =
            normal_window_position::<()>(true, || panic!("must not read a minimized position"));
        assert_eq!(observed, Ok(None));
        assert_eq!(
            normal_window_position::<()>(false, || Ok(Point { x: 130, y: 240 })),
            Ok(Some(Point { x: 130, y: 240 }))
        );
    }

    #[test]
    fn position_observation_preserves_vertical_drag_across_taskbar_gap() {
        // The user's primary display is below the second one. Each work area
        // excludes a 48px taskbar, so no single work area contains these
        // intermediate 280x380 window rectangles during the crossing.
        let monitors = [
            Bounds {
                x: 0,
                y: 0,
                width: 2560,
                height: 1032,
            },
            Bounds {
                x: 0,
                y: -1080,
                width: 1920,
                height: 1032,
            },
        ];
        for y in [60, 1, 0, -1, -24, -48, -200, -428, -600] {
            let point = Point { x: 200, y };
            assert_eq!(
                normal_window_position::<()>(false, || Ok(point)),
                Ok(Some(point))
            );
        }
        // Recovering on every move would push a crossing point back down.
        assert_eq!(
            clamp(Point { x: 200, y: -24 }, (280, 380), &monitors),
            Point { x: 200, y: 0 }
        );
    }

    #[test]
    fn explicit_expansion_recovers_bottom_edge_after_compact_drag() {
        let monitors = [Bounds {
            x: 0,
            y: 0,
            width: 2560,
            height: 1032,
        }];
        let compact_point = Point { x: 200, y: 996 };
        assert_eq!(clamp(compact_point, (280, 36), &monitors), compact_point);
        assert_eq!(
            clamp(compact_point, (280, 380), &monitors),
            Point { x: 200, y: 652 }
        );
    }
}
