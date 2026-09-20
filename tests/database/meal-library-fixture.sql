\ir legacy-meals/library-policy.sql
-- Legacy recipes intentionally have no invented servings or instructions.
insert into public.meal_definitions(id,household_id,name,recipe_url,notes) values
 ('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000010','Legacy soup','javascript:legacy-link','Notes are not instructions'),
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000010','Second recipe',null,null),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000020','Other home recipe',null,null);
insert into public.meal_grocery_templates(id,household_id,meal_definition_id,name,quantity,unit,note,sort_order) values
 ('00000000-0000-4000-8000-000000000300','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000200','Tomatoes','1/2','cup','Chopped',1),
 ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000200','Tomatoes','250','g',null,1),
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000202','Private ingredient',null,null,null,0);
