from datetime import UTC, datetime, timedelta

import pytest

from lunawindow.ephemeris import Position, Series
from lunawindow.visibility import Window, longest_outage, simultaneous_windows, visible_windows

START = datetime(2027, 1, 1, tzinfo=UTC)
HOUR = timedelta(hours=1)


def time(hours):
    return START + HOUR * hours


def test_visibility_windows_are_interpolated_individually_before_intersection():
    times = [time(0), time(1), time(2)]
    sun = visible_windows(times, [-1, 3, 3])
    earth = visible_windows(times, [1, -1, 3])
    assert sun == [Window(time(0.25), time(2))]
    assert earth == [Window(time(0), time(0.5)), Window(time(1.25), time(2))]
    assert simultaneous_windows(sun, earth) == [
        Window(time(0.25), time(0.5)),
        Window(time(1.25), time(2)),
    ]
    assert longest_outage(earth, Window(time(0), time(2))) == 2700


def test_zero_clearance_is_not_visible_and_touching_windows_do_not_overlap():
    assert visible_windows([time(0), time(1)], [0, 0]) == []
    assert simultaneous_windows([Window(time(0), time(1))], [Window(time(1), time(2))]) == []
    assert longest_outage([], Window(time(0), time(2))) == 7200


def test_sampling_keeps_exact_bounds_and_wraps_azimuth_at_north():
    series = Series(
        START,
        HOUR,
        (
            (Position(359, -2), Position(1, 2)),
            (Position(1, 2), Position(359, -2)),
            (Position(3, 2), Position(357, -2)),
        ),
    )
    samples = series.samples_between(time(0.5), time(1.25))
    assert [p.time_utc for p in samples] == [time(0.5), time(1), time(1.25)]
    assert samples[0].sun == Position(0, 0)
    assert samples[0].earth == Position(0, 0)
    assert samples[-1].sun == Position(1.5, 2)
    with pytest.raises(ValueError, match="coverage"):
        series.sample_at(time(3))
