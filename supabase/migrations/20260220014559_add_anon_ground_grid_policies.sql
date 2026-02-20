/*
  # Add anon role policies for ground grid tables

  1. Problem
    - All existing RLS policies target `authenticated` role only
    - When users are not logged in, the `anon` role has no policies, blocking all operations
    - The default user_id is 'Dustin', so unauthenticated access should work for that user

  2. Changes
    - Add SELECT, INSERT, UPDATE, DELETE policies for `anon` role on all four ground grid tables
    - Designs: allow when user_id = 'Dustin'
    - Rods, Conductors, Results: allow when parent design has user_id = 'Dustin'

  3. Security
    - Anon access is restricted to rows where user_id = 'Dustin' only
    - Authenticated users still use existing policies with auth.uid() checks
*/

CREATE POLICY "Anon can view default grid designs"
  ON ground_grid_designs FOR SELECT
  TO anon
  USING (user_id = 'Dustin');

CREATE POLICY "Anon can insert default grid designs"
  ON ground_grid_designs FOR INSERT
  TO anon
  WITH CHECK (user_id = 'Dustin');

CREATE POLICY "Anon can update default grid designs"
  ON ground_grid_designs FOR UPDATE
  TO anon
  USING (user_id = 'Dustin')
  WITH CHECK (user_id = 'Dustin');

CREATE POLICY "Anon can delete default grid designs"
  ON ground_grid_designs FOR DELETE
  TO anon
  USING (user_id = 'Dustin');

CREATE POLICY "Anon can view rods for default designs"
  ON ground_grid_rods FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can insert rods for default designs"
  ON ground_grid_rods FOR INSERT
  TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can update rods for default designs"
  ON ground_grid_rods FOR UPDATE
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id AND d.user_id = 'Dustin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can delete rods for default designs"
  ON ground_grid_rods FOR DELETE
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can view conductors for default designs"
  ON ground_grid_conductors FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can insert conductors for default designs"
  ON ground_grid_conductors FOR INSERT
  TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can update conductors for default designs"
  ON ground_grid_conductors FOR UPDATE
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id AND d.user_id = 'Dustin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can delete conductors for default designs"
  ON ground_grid_conductors FOR DELETE
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can view results for default designs"
  ON ground_grid_results FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can insert results for default designs"
  ON ground_grid_results FOR INSERT
  TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can update results for default designs"
  ON ground_grid_results FOR UPDATE
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id AND d.user_id = 'Dustin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id AND d.user_id = 'Dustin'
  ));

CREATE POLICY "Anon can delete results for default designs"
  ON ground_grid_results FOR DELETE
  TO anon
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id AND d.user_id = 'Dustin'
  ));
