# Plan

What is done is in the [changelog](../CHANGELOG.md). Open items, most useful first.

## Volume tool: compare with professional software

The tool has been checked against synthetic shapes with a known answer (within 0.5 %) but not yet against a professional package on a real pile.

- [ ] **Compare with 3Dsurvey** (or similar): same pile, same outline. Note the difference and its cause before using the numbers for invoicing or reports.
- [ ] **Triangulated base surface** as an option. Today the base is one plane (possibly tilted) through the clicked points. A triangulated base follows uneven ground around the pile and is expected to be the biggest source of difference on sloping or bumpy ground, possibly several percent.
- [ ] **Leave out what isn't material**: vegetation, machines, people and noise inside the outline are counted today. Use the classification if the scan has one, or the lowest points per cell instead of the mean.
- [ ] **Overhangs and multi-level shapes**: a cell has one height. At least warn when a cell's heights spread widely.
- [ ] **Gaps**: show the filled cells in the highlight.

## Volume tool: other

- [ ] Highlight while the outline is still being clicked (today it appears after the calculation).
- [ ] Speed of the 400-cell grid on large outlines, measured in a real browser with a graphics card.
- [ ] A test on a real pile and a real excavation, by hand, in a normal browser.

## Installer and admin

- [ ] Express 5 (removes the two moderate `qs` advisories).
- [ ] Optional password or expiring links for individual project pages.
- [ ] Support for ARM servers once PotreeConverter has an ARM build (or a documented source build).
- [ ] Touch support for the Bounding Box.
