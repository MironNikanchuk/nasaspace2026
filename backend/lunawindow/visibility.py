from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from itertools import pairwise


@dataclass(frozen=True)
class Window:
    start_utc: datetime
    end_utc: datetime

    @property
    def duration_seconds(self) -> float:
        return (self.end_utc - self.start_utc).total_seconds()


def visible_windows(times: Sequence[datetime], clearances: Sequence[float]) -> list[Window]:
    intervals = []
    for (start, left), (end, right) in pairwise(zip(times, clearances, strict=True)):
        if left <= 0 and right <= 0:
            continue
        if left <= 0 or right <= 0:
            crossing = start + (end - start) * (-left / (right - left))
            if left <= 0:
                start = crossing
            else:
                end = crossing
        if start < end:
            intervals.append(Window(start, end))
    return merge_windows(intervals)


def merge_windows(windows: Iterable[Window]) -> list[Window]:
    merged: list[Window] = []
    for window in windows:
        if merged and window.start_utc <= merged[-1].end_utc:
            merged[-1] = Window(merged[-1].start_utc, max(merged[-1].end_utc, window.end_utc))
        else:
            merged.append(window)
    return merged


def simultaneous_windows(left: Sequence[Window], right: Sequence[Window]) -> list[Window]:
    intersections = []
    first = second = 0
    while first < len(left) and second < len(right):
        a, b = left[first], right[second]
        start = max(a.start_utc, b.start_utc)
        end = min(a.end_utc, b.end_utc)
        if start < end:
            intersections.append(Window(start, end))
        if a.end_utc <= b.end_utc:
            first += 1
        if b.end_utc <= a.end_utc:
            second += 1
    return intersections


def longest_outage(windows: Sequence[Window], interval: Window) -> float:
    last_end = interval.start_utc
    longest = 0.0
    for window in windows:
        longest = max(longest, (window.start_utc - last_end).total_seconds())
        last_end = window.end_utc
    return max(longest, (interval.end_utc - last_end).total_seconds())
