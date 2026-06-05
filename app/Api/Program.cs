using Api.Data;
using Api.Endpoints;
using Api.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=apl.db"));

// Polite HTTP client for public-website enrichment (PRD §6.2): sane UA, timeout.
builder.Services.AddHttpClient<EnrichmentService>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(10);
    c.DefaultRequestHeaders.UserAgent.ParseAdd(
        "APL-Search-Assistant/0.2 (+https://github.com/laszloprekop/APL_search_assistant; personal internship search)");
    c.DefaultRequestHeaders.Accept.ParseAdd("text/html");
});

// Serialize enums as strings (matches the DB representation and the extension JSON).
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Dev CORS: allow the Vite dev server (localhost:5173) and the chrome-extension:// origin.
// Local-first single-user app — permissive in dev is fine; tighten if ever hosted.
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddOpenApi();

var app = builder.Build();

// Apply migrations on startup so cloning + run = working DB (PRD: ship schema, not data).
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();
app.MapApiEndpoints();

app.Run();
